/**
 * print.js — Génération et impression des documents officiels
 * Oral DNB · Collège Joliot Curie  —  Rev.11
 *
 * Corrections Rev.11 :
 *   — Suppression du bloc de code mort ouvrirModal/fermerModal dans
 *     ouvrirParamsImpression() et sauvegarderParamsImpression()
 *     (modal-params-impression supprimée en Rev.7, remplacée par panneau inline)
 *   — Ajout avertissement JSON dans exporterJSON() si une signature est présente
 *
 * Héritage Rev.10 :
 *   [PAGE-GARDE] Bandeau de garde = page 1 dédiée, documents à partir de la page 2
 * Héritage Rev.9 :
 *   [BUG-BLANC] Page blanche → _imprimer() utilise window.open() + fallback
 * Héritage Rev.8 :
 *   [BUG-5] _lireEditeur() : filtre vides uniquement à la sauvegarde finale
 *   — _esc2 remplacée par window.escHtml (défini dans ui.js)
 */

'use strict';

// ══════════════════════════════════════════════════════════════
// PRINT CONFIG — valeurs par défaut, stockées dans AppData.params
// ══════════════════════════════════════════════════════════════

const PrintConfig = {

  get() {
    const p = AppData.params;
    if (!p.impression) p.impression = {};
    const d = p.impression;
    return {
      logoBase64      : d.logoBase64      || null,
      fonctionSign    : d.fonctionSign    || 'Principal adjoint',
      genreSign       : d.genreSign       || 'M',
      nomSign         : d.nomSign         || '',
      dateSign        : d.dateSign        || '',
      signatureBase64 : d.signatureBase64 || null,
      convocEleve : {
        afficherSujet       : d.convocEleve?.afficherSujet       ?? true,
        afficherParcours    : d.convocEleve?.afficherParcours    ?? true,
        afficherLangue      : d.convocEleve?.afficherLangue      ?? true,
        afficherAmenagement : d.convocEleve?.afficherAmenagement ?? true,
        afficherBinome      : d.convocEleve?.afficherBinome      ?? true,
        consignesExtra      : d.convocEleve?.consignesExtra      || [],
        consignesSuppr      : d.convocEleve?.consignesSuppr      || [],
      },
      convocJury : {
        afficherSujet    : d.convocJury?.afficherSujet    ?? true,
        afficherPauses   : d.convocJury?.afficherPauses   ?? true,
        afficherRemarque : d.convocJury?.afficherRemarque ?? true,
        remarqueTexte    : d.convocJury?.remarqueTexte    || "En cas d'empêchement ou de question urgente, contactez immédiatement le secrétariat ou la direction. Notez « ABS » en face de tout candidat absent. Conservez ce document jusqu'à la fin de la journée.",
      },
      recap : {
        afficherSujet    : d.recap?.afficherSujet    ?? true,
        afficherLangue   : d.recap?.afficherLangue   ?? true,
        afficherClasse   : d.recap?.afficherClasse   ?? true,
      },
      emargement : {
        afficherSujet    : d.emargement?.afficherSujet    ?? true,
        afficherAmem     : d.emargement?.afficherAmem     ?? true,
        colonneNote      : d.emargement?.colonneNote      ?? false,
      },
    };
  },

  set(data) {
    AppData.params.impression = data;
    if (typeof Unsaved !== 'undefined') Unsaved.marquer();
  },

  formatDateSign(dateStr) {
    if (!dateStr) return '___________________';
    try {
      const d = new Date(dateStr + 'T12:00:00');
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch { return dateStr; }
  },
};

// ══════════════════════════════════════════════════════════════
// PRINT — générateur de documents
// ══════════════════════════════════════════════════════════════

const Print = {

  // ─────────────────────────────────────────────────────────────
  // UTILITAIRES
  // ─────────────────────────────────────────────────────────────

  _imprimer(html) {
    // ── Rev.9 : impression via window.open ──────────────────────
    // Raison : injecter dans #print-zone et appeler window.print() sur la page principale
    // génère systématiquement une première page blanche sous Chrome/Edge (Windows),
    // car le navigateur réserve une page pour le DOM de l'application avant #print-zone.
    // Solution : ouvrir une nouvelle fenêtre qui ne contient QUE les pages à imprimer.
    // ─────────────────────────────────────────────────────────────
    const cssPages = `@page {
  margin: 0;        /* les marges sont gérées par .print-page en CSS */
  size: A4 portrait;
}
@page listing-a3 {
  size: A3 portrait;
  margin: 1.2cm 1.5cm;
}
@page affiche-a4l {
  size: A4 landscape;
  margin: 1cm 1.2cm;
}`;
    const cssRules = `/* Masquer l'interface — seul #print-zone s'imprime */
  .sidebar, .modal-backdrop, dialog.modal, #notif-zone,
  .tab-panel, .unsaved-banner, .params-bandeau,
  .calc-panel, .stats-bar, .section-header,
  .toolbar, .counter-bar, .table-wrapper,
  .affectation-grid, .impressions-grid, .rgpd-banner { display: none !important; }

  .app-layout   { display: block; }
  .main-wrapper { display: block; }
  .app-main     { display: block; padding: 0; max-width: 100%; }
  #print-zone   { display: block !important; }

  body { background: white; font-size: 10.5pt; color: #000; font-family: Arial, sans-serif; }

  .print-page { padding: 1cm 1.5cm; page-break-after: always; }
  .print-page:last-child { page-break-after: avoid; }
  .print-header { display: grid; grid-template-columns: 1fr auto 1fr; gap: 1cm; align-items: start; margin-bottom: .5cm; }
  .print-header-left  { text-align: left; }
  .print-header-right { text-align: right; }
  .print-header-center { text-align: center; }
  .print-etab    { font-size: 9pt; font-weight: bold; text-transform: uppercase; }
  .print-annee   { font-size: 8pt; color: #555; margin-top: 2pt; }
  .print-titre   { font-size: 14pt; font-weight: bold; text-transform: uppercase; letter-spacing: .08em; color: #0d2240; }
  .print-sous-titre { font-size: 10pt; color: #555; }
  .print-doc-titre  { font-size: 11pt; font-weight: bold; color: #0d2240; }
  .print-doc-sous   { font-size: 9pt; color: #555; }
  .print-hr { border: none; border-top: 2px solid #0d2240; margin: .4cm 0; }

  .print-table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: .3cm; }
  .print-table th { background: #0d2240 !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 4pt 6pt; text-align: left; font-size: 8pt; }
  .print-table td { padding: 3.5pt 6pt; border-bottom: 1px solid #ddd; vertical-align: top; }
  .print-table tr:nth-child(even) td { background: #f8f9fa !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  tr { page-break-inside: avoid; }

  .convoc-bloc-eleve { margin: .5cm 0; padding: .4cm .5cm; border: 2px solid #0d2240; border-radius: 4pt; }
  .convoc-nom    { font-size: 18pt; font-weight: bold; text-transform: uppercase; color: #0d2240; }
  .convoc-classe { font-size: 11pt; margin-top: .2cm; }
  .convoc-badge-amem { background: #fef3c7; border: 1px solid #f59e0b; display: inline-block; padding: 2pt 8pt; border-radius: 3pt; font-size: 9pt; font-weight: bold; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .convoc-binome { font-size: 10pt; margin-top: .2cm; }
  .convoc-table { width: 100%; border-collapse: collapse; margin: .4cm 0; font-size: 11pt; }
  .convoc-table th { background: #163566 !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 5pt 8pt; text-align: center; }
  .convoc-table td { padding: 6pt 8pt; border: 1px solid #ccc; text-align: center; }
  .convoc-heure-convoc  { font-size: 16pt; font-weight: bold; color: #dc2626; }
  .convoc-heure-passage { font-size: 14pt; font-weight: bold; }
  .convoc-consignes-eleve { margin-top: .4cm; font-size: 9pt; }
  .convoc-consignes-eleve ul { margin-left: .5cm; margin-top: .2cm; }
  .convoc-consignes-eleve li { margin-bottom: .15cm; }
  .convoc-footer { margin-top: .6cm; display: flex; justify-content: flex-end; }
  .convoc-signature { font-size: 9pt; text-align: center; }

  .jury-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .15cm .5cm; margin: .3cm 0 .4cm; font-size: 9.5pt; }
  .label { font-weight: bold; color: #374151; }
  .print-section-titre { font-size: 11pt; font-weight: bold; margin: .4cm 0 .2cm; color: #0d2240; border-bottom: 1px solid #0d2240; padding-bottom: .1cm; }
  .jury-remarques { margin-top: .4cm; font-size: 8.5pt; color: #555; font-style: italic; border-top: 1px solid #ddd; padding-top: .2cm; }

  .recap-date { font-size: 9pt; color: #555; margin-bottom: .4cm; }
  .recap-jury-bloc { margin-bottom: .6cm; page-break-inside: avoid; }
  .recap-jury-titre { background: #163566 !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 4pt 8pt; font-size: 10pt; font-weight: bold; }

  .emarg-ligne { height: 1cm; }
  .emarg-certif { margin-top: .6cm; padding-top: .3cm; border-top: 1px solid #ccc; font-size: 9pt; }
  .emarg-sign-jury { display: flex; align-items: center; gap: .5cm; margin-top: .3cm; }
  .sign-box { border: 1px solid #999; width: 5cm; height: 1.5cm; }

  .consignes-titre { font-size: 12pt; font-weight: bold; color: #0d2240; margin: .4cm 0 .3cm; }
  .consignes-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .4cm; }
  .consigne-bloc { padding: .3cm .4cm; border: 1px solid #ddd; border-radius: 3pt; page-break-inside: avoid; }
  .consigne-bloc h4 { font-size: 9.5pt; font-weight: bold; color: #0d2240; margin-bottom: .2cm; }
  .consigne-bloc ul { margin-left: .4cm; font-size: 8.5pt; }
  .consigne-bloc li { margin-bottom: .1cm; }
  .consignes-footer { margin-top: .5cm; padding-top: .3cm; border-top: 1px solid #ddd; font-size: 8.5pt; color: #555; text-align: center; }

/* ── Convocation élève enrichie ─────────────────────────── */
  .convoc-classe-row {
    display: flex; gap: 1.5cm; align-items: baseline;
    font-size: 10.5pt; margin-top: .25cm;
  }
  .convoc-langue { font-size: 10pt; }
  .convoc-amenagements {
    margin-top: .3cm;
    display: flex; gap: .3cm; align-items: center; flex-wrap: wrap;
  }
  .convoc-amem-titre { font-size: 9pt; font-weight: bold; color: #92400e; }
  .convoc-badge-amem {
    background: #fef3c7 !important;
    border: 1px solid #f59e0b !important;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    display: inline-block; padding: 2pt 7pt; border-radius: 3pt;
    font-size: 8.5pt; font-weight: bold; color: #92400e;
  }
  .convoc-sujet-bloc {
    margin: .35cm 0;
    padding: .3cm .5cm;
    border-left: 3pt solid #163566;
    background: #f0f4ff !important;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    font-size: 9.5pt;
  }
  .convoc-sujet-ligne { margin-bottom: .15cm; }
  .convoc-sujet-label { color: #555; font-weight: normal; }

  /* ── Convocation jury — en-tête co-jurys ────────────────── */
  .jury-membres-grid {
    display: flex; gap: .5cm; flex-wrap: wrap;
    margin: .3cm 0 .25cm;
    padding: .3cm .5cm;
    border: 1.5pt solid #0d2240;
    border-radius: 4pt;
    background: #f0f4ff !important;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .jury-membre-bloc { flex: 1; min-width: 5cm; }
  .jury-membre-num  { font-size: 7.5pt; color: #555; text-transform: uppercase; letter-spacing: .04em; display: block; }
  .jury-membre-nom  { font-size: 11pt; color: #0d2240; display: block; }

  /* ── Bandeau infos jury (remplace jury-info-grid) ─────────── */
  .jury-info-bandeau {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: .15cm .4cm;
    margin: .2cm 0 .35cm;
    font-size: 9pt;
  }
  .jury-info-bandeau.small { grid-template-columns: repeat(4, 1fr); }
  .jury-info-item { display: flex; flex-direction: column; }
  .jury-info-item .label { font-size: 7.5pt; color: #777; text-transform: uppercase; letter-spacing: .03em; }
  .jury-info-item strong { font-size: 9.5pt; color: #0d2240; }

  /* ── Sujet dans le planning jury ─────────────────────────── */
  .jury-sujet-cell { font-size: 8pt; color: #333; max-width: 120pt; }
  .jury-cand-nom   { font-weight: bold; font-size: 9pt; display: block; }
  .jury-cand-classe { font-size: 8pt; color: #555; margin-right: 4pt; }
  .cand-sep { border: none; border-top: .5pt dotted #ccc; margin: 2pt 0; }
  .print-badge-amem { font-size: 7pt; background: #fef3c7 !important; color: #92400e; padding: 1pt 4pt; border-radius: 2pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .print-badge-prio { font-size: 7pt; background: #fee2e2 !important; color: #991b1b; padding: 1pt 4pt; border-radius: 2pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .print-badge-bin  { font-size: 7pt; background: #f0fdf4 !important; color: #166534; padding: 1pt 4pt; border-radius: 2pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* ── Feuille d'émargement — grande zone signature ─────────── */
  .emarg-table { font-size: 9pt; }
  .emarg-ligne { height: 2cm !important; }   /* hauteur doublée */
  .emarg-heure   { font-weight: bold; font-size: 9.5pt; white-space: nowrap; }
  .emarg-nom     { font-size: 9.5pt; vertical-align: middle; }
  .emarg-prenom  { font-weight: normal; font-size: 8.5pt; color: #444; }
  .emarg-amem    { font-size: 8pt; color: #92400e; }
  .emarg-sujet   { font-size: 7.5pt; color: #333; max-width: 90pt; }
  .emarg-signature-cell { vertical-align: middle; padding: 4pt 6pt !important; }
  .emarg-sign-zone {
    width: 100%;
    height: 1.6cm;
    border: 1pt solid #bbb;
    border-radius: 2pt;
  }

  /* Zone signature jury en bas de page */
  .emarg-sign-jury-row { display: flex; gap: .5cm; align-items: flex-end; margin-top: .3cm; }
  .emarg-sign-jury-item { display: flex; flex-direction: column; gap: .2cm; font-size: 8.5pt; }
  .emarg-sign-jury-item.large { flex: 1; }
  .sign-box-date { width: 3cm; height: 1.2cm; border: 1pt solid #999; border-radius: 2pt; }
  .sign-box-jury { width: 100%; height: 2cm;  border: 1pt solid #999; border-radius: 2pt; }

  /* ── Recap sujet ──────────────────────────────────────────── */
  .recap-sujet { font-size: 7.5pt; color: #444; max-width: 100pt; }
  .recap-jury-titre { font-size: 10pt; }

  /* ── Consignes intro ─────────────────────────────────────── */
  .consignes-intro { font-size: 9pt; margin-bottom: .35cm; color: #333; }

/* Déjà défini plus haut : .print-page { padding: 1cm 1.5cm; } */
  /* On s'assure que body n'ajoute pas de marge supplémentaire */
  body { margin: 0 !important; padding: 0 !important; }
  #print-zone { margin: 0 !important; padding: 0 !important; }

  /* ── Logo dans l'en-tête ──────────────────────────────────── */
  .print-logo {
    max-height: 1.5cm;
    max-width: 4cm;
    object-fit: contain;
    display: block;
    margin-bottom: .2cm;
  }
  .print-logo-vide { height: 0; display: block; }

  /* ── Signature du signataire ──────────────────────────────── */
  .print-signature-img {
    max-height: 1.8cm;
    max-width: 5cm;
    object-fit: contain;
    display: block;
    margin: .2cm 0;
  }
  .print-signature-vide {
    height: 1.5cm;
    display: block;
  }
  .print-cachet-label {
    font-size: 8pt;
    color: #555;
    margin-top: .4cm;
  }

  /* ── Pied de convocation aligné à droite ──────────────────── */
  .convoc-footer {
    margin-top: .6cm;
    display: flex;
    justify-content: flex-end;
  }
  .convoc-signature {
    font-size: 9pt;
    text-align: center;
    min-width: 6cm;
  }

.garde-bandeau {
    border: 1.5pt solid #163566;
    border-radius: 4pt;
    margin-bottom: .5cm;
    overflow: hidden;
    font-family: Arial, sans-serif;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .garde-row-top {
    display: flex;
    align-items: stretch;
    background: #163566 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    padding: .25cm .4cm;
    gap: .4cm;
  }

  .garde-left {
    display: flex;
    align-items: center;
    gap: .3cm;
    flex: 1.2;
  }
  .garde-logo {
    max-height: 32pt;
    max-width: 70pt;
    object-fit: contain;
    filter: brightness(0) invert(1);
  }
  .garde-etab {
    font-size: 9pt;
    font-weight: bold;
    color: white !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .garde-annee {
    font-size: 7.5pt;
    color: rgba(255,255,255,.75) !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .garde-center {
    flex: 2;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .garde-type-epreuve {
    font-size: 8pt;
    color: rgba(255,255,255,.8) !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    text-transform: uppercase;
    letter-spacing: .06em;
  }
  .garde-date {
    font-size: 11pt;
    font-weight: 900;
    color: #fde68a !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    margin-top: 1pt;
  }

  .garde-right {
    flex: 1.2;
    text-align: right;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .garde-doc-type {
    font-size: 9pt;
    font-weight: bold;
    color: white !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .garde-edition {
    font-size: 7pt;
    color: rgba(255,255,255,.6) !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    margin-top: 2pt;
  }

  /* Bande de stats */
  .garde-row-stats {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: .3cm;
    padding: .18cm .4cm;
    background: #f0f4ff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    border-top: 1pt solid #c7d2fe;
  }

  .garde-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 36pt;
    padding: 0 .2cm;
    border-right: .5pt solid #c7d2fe;
  }
  .garde-stat:last-of-type { border-right: none; }
  .garde-stat-val {
    font-size: 13pt;
    font-weight: 900;
    color: #163566;
    line-height: 1;
  }
  .garde-stat-lbl {
    font-size: 6.5pt;
    text-transform: uppercase;
    letter-spacing: .04em;
    color: #64748b;
    margin-top: 1pt;
  }
  .garde-stat-warn .garde-stat-val { color: #dc2626; }

  /* Répartition par classe — inline, à la suite des stats */
  .garde-classes {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    gap: .15cm .3cm;
    align-items: center;
    padding-left: .3cm;
    border-left: .5pt solid #c7d2fe;
  }
  .garde-classe-item {
    font-size: 8pt;
    color: #1e3a5f;
    background: white !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    border: .5pt solid #93c5fd;
    border-radius: 3pt;
    padding: 1pt 5pt;
    white-space: nowrap;
  }

/* Plus de page blanche : le bandeau de garde est inline dans la première page,
     pas une .print-page séparée. La règle ci-dessous reste en sécurité. */
  #print-zone > .print-page:last-child {
    page-break-after: avoid !important;
    break-after: avoid !important;
  }

  /* Signature : mini espace si pas d'image (vs grande boite vide) */
  .print-signature-vide-mini {
    height: .6cm;
    display: block;
  }

  /* Nom du signataire */
  .convoc-sign-nom {
    font-weight: bold;
    font-size: 10pt;
    margin: 2pt 0;
  }
  .convoc-sign-vide {
    color: #999;
    font-weight: normal;
  }

  /* Cachet de l'établissement — boite */
  .print-cachet-box {
    width: 4.5cm;
    height: 2cm;
    border: 1pt solid #aaa;
    border-radius: 2pt;
    margin: .2cm auto 0;
    display: block;
  }

  /* Lignes de pause dans le planning jury imprimé */
  .jury-print-pause-row td {
    background: #f0f4ff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-size: 8.5pt;
    color: #163566;
    padding: 3pt 8pt;
    border-bottom: 1pt solid #c7d2fe;
    font-style: italic;
  }
  .jury-print-pause-label {
    font-weight: 600;
    letter-spacing: .02em;
  }

/* ── Sélecteurs de page nommée ─────────────────────────────── */
  .print-page-a3p { page: listing-a3; }
  .print-page-a4l { page: affiche-a4l; }

  /* ═══════════════════════════════
     LISTING ALPHABÉTIQUE (A3)
  ═══════════════════════════════ */

  /* Listing continu : pas de .print-page, donc pas de page-break-after automatique.
     La pagination est gérée naturellement par l'imprimante via @page listing-a3. */
  .listing-page-continue {
    font-family: Arial, sans-serif;
    /* Pas de page-break-after — le contenu coule sur autant de feuilles que nécessaire */
  }

  .listing-header {
    display: grid;
    grid-template-columns: 1fr 2fr 1fr;
    gap: .5cm;
    align-items: center;
    border-bottom: 2.5pt solid #163566;
    padding-bottom: .35cm;
    margin-bottom: .4cm;
  }
  .listing-header-left  { display: flex; align-items: center; gap: .3cm; }
  .listing-header-center { text-align: center; }
  .listing-header-right { text-align: right; }

  .listing-logo {
    max-height: 40pt;
    max-width: 80pt;
    object-fit: contain;
  }
  .listing-etab {
    font-size: 9pt;
    font-weight: bold;
    color: #163566;
    display: block;
  }
  .listing-annee { font-size: 7.5pt; color: #666; }

  .listing-titre {
    font-size: 9pt;
    color: #555;
    text-transform: uppercase;
    letter-spacing: .06em;
  }
  .listing-sous-titre {
    font-size: 13pt;
    font-weight: 900;
    color: #163566;
    letter-spacing: .05em;
    text-transform: uppercase;
    margin: 2pt 0;
  }
  .listing-date {
    font-size: 11pt;
    font-weight: bold;
    color: #dc2626 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .listing-page-info   { font-size: 8pt; color: #555; font-weight: bold; }
  .listing-range       { font-size: 7.5pt; color: #888; }
  .listing-total       { font-size: 9pt; font-weight: bold; color: #163566; }
  .listing-total-label { font-size: 10pt; font-weight: bold; color: #163566; text-align: right; }

  /* Tableau listing continu */
  .listing-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13pt;
  }
  /* Répéter l'en-tête sur chaque page imprimée */
  .listing-table thead {
    display: table-header-group;
  }
  .listing-table tbody tr {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .listing-table thead tr {
    background: #163566 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .listing-table th {
    color: white !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    padding: 5pt 8pt;
    font-size: 10pt;
    text-transform: uppercase;
    letter-spacing: .04em;
    font-weight: 700;
    text-align: left;
  }
  .listing-th-rang   { width: 28pt; text-align: center; }
  .listing-th-nom    { width: auto; }
  .listing-th-classe { width: 55pt; text-align: center; }
  .listing-th-heure  { width: 75pt; text-align: center; }
  .listing-th-salle  { width: 55pt; text-align: center; }
  .listing-th-jury   { width: 140pt; }

  .listing-row td {
    padding: 5pt 8pt;
    border-bottom: .5pt solid #e2e8f0;
    vertical-align: middle;
    line-height: 1.3;
  }
  .listing-row-even td {
    background: #f8fafc !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .listing-cell-rang   { text-align: center; font-size: 10pt; color: #999; }
  .listing-cell-nom    { font-size: 13pt; }
  .listing-cell-nom strong { font-size: 14pt; letter-spacing: .01em; }
  .listing-cell-classe { text-align: center; font-size: 12pt; font-weight: 600; color: #163566; }
  .listing-cell-heure  {
    text-align: center;
    font-size: 16pt;
    font-weight: 900;
    color: #163566;
    letter-spacing: .03em;
  }
  .listing-cell-salle  {
    text-align: center;
    font-size: 18pt;
    font-weight: 900;
    color: #dc2626 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .listing-cell-jury { font-size: 10pt; color: #444; }

  .listing-badge-amem {
    display: inline-block;
    background: #fef3c7 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color: #92400e;
    border: .5pt solid #fcd34d;
    font-size: 7pt;
    padding: 1pt 4pt;
    border-radius: 3pt;
    margin-left: 4pt;
    vertical-align: middle;
  }
  .listing-badge-prio {
    display: inline-block;
    background: #fce7f3 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color: #9d174d;
    border: .5pt solid #f9a8d4;
    font-size: 7pt;
    padding: 1pt 4pt;
    border-radius: 3pt;
    margin-left: 4pt;
    vertical-align: middle;
  }

  /* ═══════════════════════════════
     AFFICHE PORTE (A4 paysage)
  ═══════════════════════════════ */

  .affiche-porte {
    padding: 0;
    display: flex;
    flex-direction: column;
    height: calc(210mm - 2cm);  /* hauteur A4 paysage moins marges */
    overflow: hidden;
    font-family: 'Arial', sans-serif;
  }

  /* Bandeau supérieur */
  .affiche-top-band {
    display: flex;
    align-items: center;
    gap: .5cm;
    padding: .3cm .4cm;
    background: #163566 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color: white;
  }
  .affiche-logo {
    max-height: 32pt;
    max-width: 70pt;
    object-fit: contain;
    filter: brightness(0) invert(1);
  }
  .affiche-etab-bloc {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .affiche-etab {
    font-size: 11pt;
    font-weight: bold;
    color: white !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .affiche-epreuve {
    font-size: 8pt;
    color: rgba(255,255,255,.8) !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .affiche-date-band {
    font-size: 12pt;
    font-weight: bold;
    color: #fde68a !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    text-align: right;
  }

  /* Corps principal : SALLE + JURY — occupe tout l'espace disponible */
  .affiche-corps {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2cm;
    padding: .5cm .8cm;
  }

  .affiche-salle-bloc,
  .affiche-jury-bloc {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .affiche-salle-label,
  .affiche-jury-label {
    font-size: 18pt;
    font-weight: 700;
    letter-spacing: .22em;
    text-transform: uppercase;
    color: #555;
  }

  .affiche-salle-num {
    font-size: 140pt;
    font-weight: 900;
    line-height: .95;
    color: #dc2626 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    letter-spacing: -.03em;
  }

  .affiche-jury-num {
    font-size: 130pt;
    font-weight: 900;
    line-height: .95;
    color: #163566 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .affiche-langue {
    font-size: 16pt;
    font-weight: bold;
    color: #163566;
    background: #e0e7ff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    padding: 3pt 12pt;
    border-radius: 4pt;
    margin-top: 4pt;
  }

  /* Séparateur vertical entre salle et jury */
  .affiche-corps::after {
    content: '';
    position: absolute;
    width: 1.5pt;
    height: 60%;
    background: #e2e8f0;
  }
  /* (pas de position absolute dans print — utiliser border) */
  .affiche-salle-bloc {
    border-right: 1.5pt solid #e2e8f0;
    padding-right: 1.5cm;
  }
  .affiche-jury-bloc {
    padding-left: 1.5cm;
  }

  /* Bandeau infos bas supprimé à la demande */`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) {
      // Popup bloqué — informer l'utilisateur et fallback ancienne méthode
      if (typeof notifier === 'function') {
        notifier(
          '⚠ Fenêtres popup bloquées. Autorisez les popups pour ce site dans Chrome/Edge : ' +
          'barre d\'adresse → icône 🔒 → Autoriser les fenêtres pop-up. ' +
          'Impression de secours lancée sur cette page.',
          'warning'
        );
      }
      const zone = document.getElementById('print-zone');
      if (!zone) { console.error('[Print] #print-zone introuvable'); return; }
      zone.innerHTML = html;
      window.print();
      setTimeout(() => { zone.innerHTML = ''; }, 2000);
      return;
    }

    win.document.open();
    win.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Impression — DNB Oral</title>
  <style>
    /* Reset minimal */
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: white; font-family: Arial, sans-serif; }

    /* @page rules */
    ${cssPages}

    /* Toutes les règles @media print, appliquées directement (pas de @media ici,
       car dans la fenêtre dédiée TOUT est impression) */
    ${cssRules}

    /* Forcer l'affichage des éléments qui sont display:none dans @media print
       uniquement à cause du masquage de l'interface principale */
    #print-zone { display: block !important; }
    .print-page { display: block; }
  </style>
</head>
<body>
${html}
</body>
</html>`);
    win.document.close();

    // Attendre le chargement des images (logo, signature) avant d'imprimer
    win.addEventListener('load', () => {
      win.focus();
      win.print();
      // Fermer la fenêtre après impression (le dialog print est fermé)
      win.addEventListener('afterprint', () => win.close());
    });
  },

  /** Utilise escHtml exposé par ui.js */
  _esc(str) {
    return (typeof window.escHtml === 'function')
      ? window.escHtml(str)
      : String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },

  _convocHeure(heureDebut) {
    return AppData.soustraireMinutes(heureDebut, AppData.params.convocAvant);
  },

  _nomEleve(e) { return `${this._esc(e.nom)} ${this._esc(e.prenom)}`; },

  _entete(titre, sousTitre = '') {
    const p   = AppData.params;
    const cfg = PrintConfig.get();
    const logoHtml = cfg.logoBase64
      ? `<img src="${cfg.logoBase64}" class="print-logo" alt="Logo établissement" />`
      : '<div class="print-logo-vide"></div>';

    // Libellé de l'épreuve selon le type
    const typeLabel = (p.typeEpreuve === 'DNB_BLANC')
      ? 'DIPLÔME NATIONAL DU BREVET &mdash; BLANC'
      : 'DIPLÔME NATIONAL DU BREVET';

    // Date de l'épreuve (si renseignée)
    let dateEpreuveHtml = '';
    if (p.dateEpreuve) {
      try {
        const dEpr = new Date(p.dateEpreuve + 'T12:00:00');
        const dStr = dEpr.toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
        dateEpreuveHtml = `<div class="print-date-epreuve">${dStr.charAt(0).toUpperCase() + dStr.slice(1)}</div>`;
      } catch { dateEpreuveHtml = `<div class="print-date-epreuve">${this._esc(p.dateEpreuve)}</div>`; }
    }

    return `
      <div class="print-header">
        <div class="print-header-left">
          ${logoHtml}
          <div class="print-etab">${this._esc(p.etablissement)}</div>
          <div class="print-annee">Année scolaire ${this._esc(p.annee)}</div>
        </div>
        <div class="print-header-center">
          <div class="print-titre">${typeLabel}</div>
          <div class="print-sous-titre">ORAL</div>
          ${dateEpreuveHtml}
        </div>
        <div class="print-header-right">
          <div class="print-doc-titre">${titre}</div>
          ${sousTitre ? `<div class="print-doc-sous">${sousTitre}</div>` : ''}
        </div>
      </div>
      <hr class="print-hr" />`;
  },

  _blocSignataire() {
    const cfg  = PrintConfig.get();
    const p    = AppData.params;
    const article = cfg.genreSign === 'F' ? 'La' : 'Le';
    const ville = (p.lieuSignature||'').trim() || (p.etablissement||'').split('—')[0].replace(/collège|lycée|école/gi,'').trim() || 'Bagneux';

    // Date de signature : afficher si renseignée, sinon ligne pointillés
    const dateSignStr = cfg.dateSign
      ? PrintConfig.formatDateSign(cfg.dateSign)
      : '___________________________';

    // Nom du signataire : afficher si renseigné, sinon ligne pointillés
    const nomSignStr = cfg.nomSign
      ? `<p class="convoc-sign-nom">${this._esc(cfg.nomSign)}</p>`
      : '<p class="convoc-sign-nom convoc-sign-vide">___________________________</p>';

    // Signature image : afficher si uploadée, sinon espace minimal (pas de grande boîte vide)
    const signatureHtml = cfg.signatureBase64
      ? `<img src="${cfg.signatureBase64}" class="print-signature-img" alt="Signature" />`
      : '<div class="print-signature-vide-mini"></div>';

    return `
      <div class="convoc-footer">
        <div class="convoc-signature">
          <p>Fait à ${this._esc(ville)}, le ${dateSignStr}</p>
          <p><strong>${article} ${this._esc(cfg.fonctionSign)}</strong></p>
          ${nomSignStr}
          ${signatureHtml}
          <p class="print-cachet-label">Cachet de l'établissement :</p>
          <div class="print-cachet-box"></div>
        </div>
      </div>`;
  },

  // ─────────────────────────────────────────────────────────────
  // 1. CONVOCATIONS ÉLÈVES
  // ─────────────────────────────────────────────────────────────


  // ─────────────────────────────────────────────────────────────────────────
  // BANDEAU DE GARDE — inséré en haut de la première page (pas de page séparée)
  // Affiche les stats clés, la date et la répartition par classe
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Retourne un bloc HTML de garde à insérer en tête du premier print-page.
   * N'est PAS une .print-page → aucun saut de page généré.
   * @param {string} typeDoc   — ex. "Convocations élèves"
   * @param {number} nbPages   — nombre de pages du document
   * @param {number} nbEleves  — nombre de candidats concernés
   */
  _bandeauGarde(typeDoc, nbPages, nbEleves) {
    const p   = AppData.params;
    const cfg = PrintConfig.get();

    // Date de l'épreuve
    let dateStr = '—';
    if (p.dateEpreuve) {
      try {
        const d = new Date(p.dateEpreuve + 'T12:00:00');
        dateStr = d.toLocaleDateString('fr-FR', {
          weekday:'long', day:'2-digit', month:'long', year:'numeric'
        });
        dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
      } catch { dateStr = p.dateEpreuve; }
    }

    const typeLabel = p.typeEpreuve === 'DNB_BLANC'
      ? 'DNB — Blanc' : 'Diplôme National du Brevet';

    const logoHtml = cfg.logoBase64
      ? `<img src="${cfg.logoBase64}" class="garde-logo" alt="Logo" />`
      : '';

    // Répartition par classe (élèves affectés uniquement)
    const elevesConcernes = new Set();
    AppData.affectation.forEach(c => c.eleveIds.forEach(id => elevesConcernes.add(id)));

    const parClasse = new Map();
    AppData.eleves
      .filter(e => elevesConcernes.has(e.id))
      .forEach(e => {
        const cl = (e.classe || '—').trim().toUpperCase();
        parClasse.set(cl, (parClasse.get(cl) || 0) + 1);
      });

    const classesTriees = [...parClasse.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
    const colonnesClasses = classesTriees.map(([cl, nb]) =>
      `<span class="garde-classe-item"><strong>${this._esc(cl)}</strong>&nbsp;: ${nb}</span>`
    ).join('');

    const nbNonAff = AppData.nbEleves() - elevesConcernes.size;
    const nbJurys  = new Set(AppData.affectation.map(c => c.juryId)).size;
    const nbCren   = AppData.affectation.length;

    const now = new Date().toLocaleDateString('fr-FR', {
      day:'2-digit', month:'2-digit', year:'numeric',
      hour:'2-digit', minute:'2-digit'
    });

    return `<div class="print-page print-page-garde"><div class="garde-bandeau">
      <div class="garde-row-top">
        <div class="garde-left">
          ${logoHtml}
          <div>
            <div class="garde-etab">${this._esc(p.etablissement)}</div>
            <div class="garde-annee">Année scolaire ${this._esc(p.annee)}</div>
          </div>
        </div>
        <div class="garde-center">
          <div class="garde-type-epreuve">${this._esc(typeLabel)} — Oral</div>
          ${p.dateEpreuve ? `<div class="garde-date">${this._esc(dateStr)}</div>` : ''}
        </div>
        <div class="garde-right">
          <div class="garde-doc-type">${this._esc(typeDoc)}</div>
          <div class="garde-edition">Édité le ${now}</div>
        </div>
      </div>
      <div class="garde-row-stats">
        <div class="garde-stat"><span class="garde-stat-val">${nbEleves}</span><span class="garde-stat-lbl">Candidats</span></div>
        <div class="garde-stat"><span class="garde-stat-val">${nbPages}</span><span class="garde-stat-lbl">Page${nbPages > 1 ? 's' : ''}</span></div>
        <div class="garde-stat"><span class="garde-stat-val">${nbJurys}</span><span class="garde-stat-lbl">Jury${nbJurys > 1 ? 's' : ''}</span></div>
        <div class="garde-stat"><span class="garde-stat-val">${nbCren}</span><span class="garde-stat-lbl">Créneaux</span></div>
        ${nbNonAff > 0 ? `<div class="garde-stat garde-stat-warn"><span class="garde-stat-val">${nbNonAff}</span><span class="garde-stat-lbl">Non affectés</span></div>` : ''}
        <div class="garde-classes">${colonnesClasses}</div>
      </div>
    </div></div>`;
  },

  convocationsEleves() {
    if (AppData.affectation.length === 0) {
      notifier('Lancez l\'affectation avant d\'imprimer les convocations.', 'warning'); return;
    }

    const cfg = PrintConfig.get().convocEleve;

    const consignesBase = [
      'Présentez-vous à l\'heure de <strong>convocation</strong> indiquée (et non à l\'heure de passage) muni(e) de votre <strong>convocation</strong> et d\'une <strong>pièce d\'identité</strong>.',
      'Apportez votre <strong>exposé préparé</strong> (document de présentation autorisé).',
      'Si vous utilisez une <strong>présentation informatique</strong>, vous devez vous assurer <em>les jours précédents</em> que votre présentation fonctionne correctement : <strong>les clés USB ne seront pas autorisées</strong>. Privilégiez un espace de stockage en ligne ou un envoi à votre enseignant.',
      'Les téléphones portables doivent être <strong>éteints et rangés</strong>.',
      'Aucun document supplémentaire ne sera fourni par le jury.',
    ];

    const consignesActives = consignesBase
      .filter((_, i) => !(cfg.consignesSuppr || []).includes(i));
    const consignesExtras = (cfg.consignesExtra || []).filter(Boolean);

    const elevesAffectes = AppData.eleves
      .map(eleve => {
        const creneau = AppData.affectation.find(c => c.eleveIds.includes(eleve.id));
        return creneau ? { eleve, creneau } : null;
      })
      .filter(Boolean)
      .sort((a, b) => {
        const hA = a.creneau.heureDebut, hB = b.creneau.heureDebut;
        if (hA !== hB) return hA < hB ? -1 : 1;
        return a.eleve.nom.localeCompare(b.eleve.nom, 'fr');
      });

    if (!elevesAffectes.length) { notifier('Aucun élève affecté à imprimer.', 'warning'); return; }

    let pages = '';

    // Date de l'épreuve formatée pour la convocation
    let dateEpreuveConvoc = '';
    if (AppData.params.dateEpreuve) {
      try {
        const dEpr = new Date(AppData.params.dateEpreuve + 'T12:00:00');
        dateEpreuveConvoc = dEpr.toLocaleDateString('fr-FR', {
          weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
        });
        dateEpreuveConvoc = dateEpreuveConvoc.charAt(0).toUpperCase() + dateEpreuveConvoc.slice(1);
      } catch { dateEpreuveConvoc = AppData.params.dateEpreuve; }
    }

    elevesAffectes.forEach(({ eleve, creneau }) => {
      const jury      = AppData.getJury(creneau.juryId);
      const hConvoc   = this._convocHeure(creneau.heureDebut);
      const partenaire = creneau.isBinome
        ? AppData.getEleve(creneau.eleveIds.find(id => id !== eleve.id))
        : null;

      const amenagements = [];
      if (eleve.amenagement) amenagements.push('Bénéficiaire d\'un tiers-temps (durée majorée)');
      if (eleve.prioritaire)  amenagements.push('Passage prioritaire');
      const blocAmenagement = cfg.afficherAmenagement && amenagements.length > 0
        ? `<div class="convoc-amenagements">
            <span class="convoc-amem-titre">⚙ Aménagements :</span>
            ${amenagements.map(a=>`<span class="convoc-badge-amem">${this._esc(a)}</span>`).join(' ')}
           </div>`
        : '';

      const blocSujet = (cfg.afficherSujet || cfg.afficherParcours) && (eleve.sujet || eleve.parcours)
        ? `<div class="convoc-sujet-bloc">
            ${cfg.afficherParcours && eleve.parcours ? `<div class="convoc-sujet-ligne"><span class="convoc-sujet-label">Parcours choisi :</span> <strong>${this._esc(eleve.parcours)}</strong></div>` : ''}
            ${cfg.afficherSujet    && eleve.sujet    ? `<div class="convoc-sujet-ligne"><span class="convoc-sujet-label">Sujet préparé :</span> <strong>${this._esc(eleve.sujet)}</strong></div>` : ''}
           </div>`
        : '';

      const blocLangue = cfg.afficherLangue && eleve.langue
        ? `<div class="convoc-langue">Langue vivante : <strong>${this._esc(eleve.langue)}</strong></div>`
        : '';

      pages += `
        <div class="print-page convocation-eleve">
          ${this._entete('CONVOCATION', 'Candidat(e)')}

          <div class="convoc-bloc-eleve">
            <div class="convoc-nom">${this._nomEleve(eleve)}</div>
            <div class="convoc-classe-row">
              <span>Classe : <strong>${this._esc(eleve.classe)}</strong></span>
              ${blocLangue}
            </div>
            ${blocAmenagement}
            ${cfg.afficherBinome && partenaire ? `<div class="convoc-binome">📋 Passage en <strong>binôme</strong> avec : <strong>${this._nomEleve(partenaire)}</strong></div>` : ''}
          </div>

          ${blocSujet}

          <table class="convoc-table">
            <tr>
              <th colspan="2">Date et heure de convocation</th>
              <th>Heure de passage</th>
              <th>Durée de l'épreuve</th>
              <th>Salle</th>
            </tr>
            <tr>
              <td class="convoc-date-cell">${dateEpreuveConvoc}</td>
              <td class="convoc-heure-convoc"><strong>${hConvoc}</strong></td>
              <td class="convoc-heure-passage">${creneau.heureDebut}</td>
              <td>${creneau.duree} min</td>
              <td><strong>${jury ? this._esc(jury.salle) : '?'}</strong></td>
            </tr>
          </table>

          <div class="convoc-consignes-eleve">
            <p><strong>Consignes :</strong></p>
            <ul>
              ${consignesActives.map(c=>`<li>${c}</li>`).join('')}
              ${consignesExtras.map(c=>`<li>${this._esc(c)}</li>`).join('')}
            </ul>
          </div>

          ${this._blocSignataire()}
        </div>`;
    });

    // Page 1 : garde autonome — Pages suivantes : une convocation par page
    const _garde1 = this._bandeauGarde('Convocations élèves', elevesAffectes.length, elevesAffectes.length);
    this._imprimer(_garde1 + pages);
  },

  // ─────────────────────────────────────────────────────────────
  // 2. CONVOCATIONS JURYS
  // ─────────────────────────────────────────────────────────────

  convocationsJurys() {
    if (AppData.affectation.length === 0) {
      notifier('Lancez l\'affectation avant d\'imprimer les convocations jury.', 'warning'); return;
    }

    const cfg = PrintConfig.get().convocJury;
    let pages = '';

    AppData.jurys.forEach(jury => {
      const creneaux = AppData.affectation.filter(c=>c.juryId===jury.id).sort((a,b)=>a.ordre-b.ordre);
      if (!creneaux.length) return;

      const membres = jury.nom.split('/').map(m=>m.trim()).filter(Boolean);
      const blocsMembers = membres.map((m,i) => `
        <div class="jury-membre-bloc">
          <span class="jury-membre-num">Enseignant${membres.length>1?' '+(i+1):''}</span>
          <strong class="jury-membre-nom">${this._esc(m)}</strong>
        </div>`).join('');

      const hDebut  = creneaux[0].heureDebut;
      const hFinale = creneaux[creneaux.length-1].heureFin;
      const nbCand  = creneaux.reduce((s,c)=>s+c.eleveIds.length,0);

      // Pauses : toujours affichées dans le bandeau de la convocation jury
      const pausesActivesList = (AppData.params.pauses||[]).filter(p=>p.active&&p.duree>0);
      const pausesTexte = pausesActivesList.map(p=>`${p.heure} (${p.duree} min)`).join(', ') || 'Aucune';
      // Préparer les pauses pour insertion dans le planning (même logique que la vue web)
      const pausesPlan = pausesActivesList
        .map(p => ({ cible: AppData.enMinutes(p.heure), duree: parseInt(p.duree,10), label: `Pause — ${p.heure} (${p.duree} min)`, insere: false }))
        .sort((a,b) => a.cible - b.cible);

      const marge = parseInt(AppData.params.margePassage, 10) || 0;
      const m2h   = m => `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
      let curseurP = AppData.enMinutes(jury.heureDebut || AppData.params.heureDebut);
      const pausesPlanJury = pausesPlan.map(p => ({ ...p, insere: false }));
      const thSujetCols = cfg.afficherSujet ? 1 : 0;
      const nbCols = 5 + thSujetCols;

      let lignes = '';
      creneaux.forEach((c, ci) => {
        // Insérer les lignes de pause au bon moment (même algorithme que la vue web)
        for (const pause of pausesPlanJury) {
          if (pause.insere) continue;
          const doitInserer =
            (ci > 0 && curseurP >= pause.cible) ||
            (curseurP < pause.cible && (curseurP + c.duree) > pause.cible);
          if (doitInserer) {
            lignes += `<tr class="jury-print-pause-row">
              <td class="text-center">☕</td>
              <td><strong>${m2h(curseurP)}</strong></td>
              <td>${m2h(curseurP + pause.duree)}</td>
              <td class="text-center">${pause.duree} min</td>
              <td colspan="${1 + thSujetCols}" class="jury-print-pause-label">${this._esc(pause.label)}</td>
            </tr>`;
            curseurP += pause.duree;
            pause.insere = true;
          }
        }

        const candidats = c.eleveIds.map(id => {
          const e = AppData.getEleve(id); if (!e) return { html:'?', sujet:'' };
          const flags = [];
          if (e.amenagement) flags.push('<span class="print-badge-amem">1/3 tps</span>');
          if (e.prioritaire)  flags.push('<span class="print-badge-prio">Prior.</span>');
          if (c.isBinome)     flags.push('<span class="print-badge-bin">Binôme</span>');
          return {
            html  : `<span class="jury-cand-nom">${this._esc(e.nom)} ${this._esc(e.prenom)}</span><span class="jury-cand-classe">${this._esc(e.classe)}</span>${flags.join('')}`,
            sujet : e.sujet || '',
          };
        });
        const sujetCell = cfg.afficherSujet
          ? `<td class="jury-sujet-cell">${candidats.map(ca=>this._esc(ca.sujet)).filter(Boolean).join('<br/>')}</td>`
          : '';
        lignes += `<tr>
          <td class="text-center"><strong>${c.ordre}</strong></td>
          <td><strong>${c.heureDebut}</strong></td>
          <td>${c.heureFin}</td>
          <td class="text-center">${c.duree} min</td>
          <td>${candidats.map(ca=>ca.html).join('<hr class="cand-sep"/>')}</td>
          ${sujetCell}
        </tr>`;
        curseurP += c.duree + marge;
      });

      const thSujet = cfg.afficherSujet ? '<th>Sujet / Parcours</th>' : '';

      pages += `
        <div class="print-page convocation-jury">
          ${this._entete('CONVOCATION JURY', `Salle ${this._esc(jury.salle)}`)}
          <div class="jury-membres-grid">${blocsMembers}</div>
          <div class="jury-info-bandeau">
            <div class="jury-info-item"><span class="label">Salle</span><strong>${this._esc(jury.salle)}</strong></div>
            <div class="jury-info-item"><span class="label">Langue vivante</span><strong>${jury.langue?this._esc(jury.langue):'Toutes / Sans'}</strong></div>
            <div class="jury-info-item"><span class="label">Début</span><strong>${hDebut}</strong></div>
            <div class="jury-info-item"><span class="label">Fin prévisionnelle</span><strong>${hFinale}</strong></div>
            <div class="jury-info-item"><span class="label">Candidats</span><strong>${nbCand}</strong></div>
            <div class="jury-info-item"><span class="label">Pause(s)</span><span>${this._esc(pausesTexte)}</span></div>
          </div>
          <h3 class="print-section-titre">Planning des passages</h3>
          <table class="print-table">
            <thead>
              <tr>
                <th style="width:28pt">#</th>
                <th style="width:38pt">Début</th>
                <th style="width:38pt">Fin</th>
                <th style="width:36pt">Durée</th>
                <th>Candidat(s)</th>
                ${thSujet}
              </tr>
            </thead>
            <tbody>${lignes}</tbody>
          </table>
          ${cfg.afficherRemarque ? `<div class="jury-remarques">${this._esc(cfg.remarqueTexte)}</div>` : ''}
        </div>`;
    });

    if (!pages) { notifier('Aucun créneau affecté.', 'warning'); return; }
    const _nbJurysP = AppData.jurys.filter(j => AppData.affectation.some(c => c.juryId === j.id)).length;
    const _nbElevJ  = AppData.affectation.reduce((s,c) => s + c.eleveIds.length, 0);
    const _garde2   = this._bandeauGarde('Convocations jurys', _nbJurysP, _nbElevJ);
    this._imprimer(_garde2 + pages);
  },

  // ─────────────────────────────────────────────────────────────
  // 3. RÉCAPITULATIF
  // ─────────────────────────────────────────────────────────────

  recapitulatif() {
    if (AppData.affectation.length === 0) {
      notifier('Lancez l\'affectation avant d\'imprimer le récapitulatif.', 'warning'); return;
    }

    const cfg  = PrintConfig.get().recap;
    const date = new Date().toLocaleDateString('fr-FR', {day:'2-digit',month:'long',year:'numeric'});

    let html = `<div class="print-page recap-page">
      ${this._entete('RÉCAPITULATIF', 'Candidats par jury')}
      <p class="recap-date">Édité le ${date} — ${AppData.nbEleves()} candidat(s) — ${AppData.nbJurys()} jury(s)</p>`;

    AppData.jurys.forEach(jury => {
      const creneaux = AppData.affectation.filter(c=>c.juryId===jury.id).sort((a,b)=>a.ordre-b.ordre);
      if (!creneaux.length) return;

      const lignes = creneaux.map(c =>
        c.eleveIds.map(id => {
          const e = AppData.getEleve(id); if (!e) return '';
          const flags = [];
          if (e.amenagement) flags.push('1/3 tps');
          if (e.prioritaire)  flags.push('Prioritaire');
          if (c.isBinome)     flags.push('Binôme');
          const tdClasse = cfg.afficherClasse ? `<td>${this._esc(e.classe)}</td>` : '';
          const tdLV     = cfg.afficherLangue ? `<td>${this._esc(e.langue||'—')}</td>` : '';
          const tdSujet  = cfg.afficherSujet  ? `<td class="recap-sujet">${this._esc(e.sujet||'—')}</td>` : '';
          return `<tr>
            <td>${c.ordre}</td>
            <td>${c.heureDebut}</td><td>${c.heureFin}</td>
            <td><strong>${this._esc(e.nom)}</strong></td>
            <td>${this._esc(e.prenom)}</td>
            ${tdClasse}${tdLV}${tdSujet}
            <td>${flags.join(', ')}</td>
          </tr>`;
        }).join('')
      ).join('');

      const thClasse = cfg.afficherClasse ? '<th>Classe</th>' : '';
      const thLV     = cfg.afficherLangue ? '<th>LV</th>'     : '';
      const thSujet  = cfg.afficherSujet  ? '<th>Sujet</th>'  : '';

      html += `<div class="recap-jury-bloc">
        <div class="recap-jury-titre">
          Jury : <strong>${this._esc(jury.nom)}</strong> — Salle <strong>${this._esc(jury.salle)}</strong>
          ${jury.langue ? '— ' + this._esc(jury.langue) : ''}
        </div>
        <table class="print-table">
          <thead><tr><th>#</th><th>Début</th><th>Fin</th><th>Nom</th><th>Prénom</th>${thClasse}${thLV}${thSujet}<th>Particularités</th></tr></thead>
          <tbody>${lignes}</tbody>
        </table>
      </div>`;
    });

    html += '</div>';
    const _nbElevR = AppData.affectation.reduce((s,c) => s + c.eleveIds.length, 0);
    const _nbJurR  = AppData.jurys.filter(j => AppData.affectation.some(c => c.juryId === j.id)).length;
    const _garde3  = this._bandeauGarde('Récapitulatif candidats', _nbJurR + 1, _nbElevR);
    this._imprimer(_garde3 + html);
  },

  // ─────────────────────────────────────────────────────────────
  // 4. FEUILLE D'ÉMARGEMENT
  // ─────────────────────────────────────────────────────────────

  feuilleEmargement() {
    if (AppData.affectation.length === 0) {
      notifier('Lancez l\'affectation avant d\'imprimer la feuille d\'émargement.', 'warning'); return;
    }

    const cfg = PrintConfig.get().emargement;
    let html  = '';

    AppData.jurys.forEach(jury => {
      const creneaux = AppData.affectation.filter(c=>c.juryId===jury.id).sort((a,b)=>a.ordre-b.ordre);
      if (!creneaux.length) return;

      const lignes = creneaux.map(c =>
        c.eleveIds.map(id => {
          const e = AppData.getEleve(id); if (!e) return '';
          const flags = [];
          if (e.amenagement) flags.push('1/3 tps');
          if (e.prioritaire)  flags.push('Prior.');
          if (c.isBinome)     flags.push('Binôme');
          const tdAmem  = cfg.afficherAmem  ? `<td class="emarg-amem">${flags.join('<br/>')}</td>` : '';
          const tdSujet = cfg.afficherSujet ? `<td class="emarg-sujet">${this._esc(e.sujet||'')}</td>` : '';
          const tdNote  = cfg.colonneNote   ? `<td class="emarg-note"></td>` : '';
          return `<tr class="emarg-ligne">
            <td class="emarg-heure">${c.heureDebut}</td>
            <td class="emarg-nom"><strong>${this._esc(e.nom)}</strong><br/><span class="emarg-prenom">${this._esc(e.prenom)}</span></td>
            <td>${this._esc(e.classe)}</td>
            ${tdAmem}${tdSujet}
            <td class="emarg-signature-cell"><div class="emarg-sign-zone"></div></td>
            ${tdNote}
          </tr>`;
        }).join('')
      ).join('');

      const thAmem  = cfg.afficherAmem  ? '<th style="width:42pt">Particularités</th>' : '';
      const thSujet = cfg.afficherSujet ? '<th>Sujet</th>'                              : '';
      const thNote  = cfg.colonneNote   ? '<th style="width:48pt">Note jury</th>'      : '';

      html += `
        <div class="print-page emarg-page">
          ${this._entete('FEUILLE D\'ÉMARGEMENT', `Jury : ${this._esc(jury.nom)} — Salle ${this._esc(jury.salle)}`)}
          <div class="jury-info-bandeau small">
            <div class="jury-info-item"><span class="label">Enseignant(s)</span><strong>${this._esc(jury.nom)}</strong></div>
            <div class="jury-info-item"><span class="label">Salle</span><strong>${this._esc(jury.salle)}</strong></div>
            <div class="jury-info-item"><span class="label">Langue</span><strong>${jury.langue?this._esc(jury.langue):'—'}</strong></div>
            <div class="jury-info-item"><span class="label">Nb candidats</span><strong>${creneaux.reduce((s,c)=>s+c.eleveIds.length,0)}</strong></div>
          </div>
          <table class="print-table emarg-table">
            <thead>
              <tr>
                <th style="width:38pt">Heure</th>
                <th style="width:80pt">Candidat</th>
                <th style="width:35pt">Classe</th>
                ${thAmem}${thSujet}
                <th style="width:130pt">Signature du candidat</th>
                ${thNote}
              </tr>
            </thead>
            <tbody>${lignes}</tbody>
          </table>
          <div class="emarg-certif">
            <p>Je soussigné${PrintConfig.get().genreSign === 'F' ? 'e' : ''}, <strong>${this._esc(jury.nom)}</strong>, certifie avoir fait passer les candidats ci-dessus.</p>
            <div class="emarg-sign-jury-row">
              <div class="emarg-sign-jury-item"><span>Date :</span><div class="sign-box-date"></div></div>
              <div class="emarg-sign-jury-item large"><span>Signature du jury :</span><div class="sign-box-jury"></div></div>
            </div>
          </div>
        </div>`;
    });

    if (!html) { notifier('Aucun créneau à émarger.', 'warning'); return; }
    const _nbElevE = AppData.affectation.reduce((s,c) => s + c.eleveIds.length, 0);
    const _nbPagE  = AppData.jurys.filter(j => AppData.affectation.some(c => c.juryId === j.id)).length;
    const _garde4  = this._bandeauGarde("Feuille d'émargement", _nbPagE, _nbElevE);
    this._imprimer(_garde4 + html);
  },

  // ─────────────────────────────────────────────────────────────
  // 5. CONSIGNES JURY (éditables)
  // ─────────────────────────────────────────────────────────────

  _getConsignes() {
    const p = AppData.params;
    if (p.consignesJury && Array.isArray(p.consignesJury) && p.consignesJury.length > 0) return p.consignesJury;
    return [
      { titre:'⏱ Durée des passages', items:[`Passage solo : ${p.dureeSolo} minutes`,`Passage binôme : ${p.dureeBinome} minutes`,'Candidat avec aménagement tiers-temps : durée × 4/3 arrondie à 5 min'] },
      { titre:'📋 Structure de l\'épreuve (solo)', items:['5 min — Exposé du candidat (sans interruption du jury)','10 min — Entretien avec le jury sur la présentation','10 min — Questions sur le programme (Langue Vivante comprise)'] },
      { titre:'✅ À vérifier à chaque passage', items:['Identité du candidat (pièce d\'identité ou carnet)','Présence d\'un support de présentation (autorisé)','La langue vivante du candidat correspond à votre jury','Signaler tout incident sur la feuille d\'émargement'] },
      { titre:'📝 Notation', items:['Note sur 100 points','Compétences : expression orale, maîtrise du sujet, réponses aux questions','Remettre la grille d\'évaluation complétée et signée au secrétariat'] },
      { titre:'⚠ Points de vigilance', items:['Confidentialité : ne pas communiquer les notes avant la proclamation','Neutralité : aucun commentaire sur la prestation devant d\'autres candidats','Candidat absent : noter « ABS » sur la feuille d\'émargement',`Pauses prévues : ${(p.pauses||[]).filter(pa=>pa.active&&pa.duree>0).map(pa=>`${pa.heure} (${pa.duree} min)`).join(', ')||'Aucune'}`] },
      { titre:'📞 En cas de problème', items:['Contacter immédiatement le secrétariat ou la direction','Ne pas prendre de décision individuelle concernant un candidat absent','En cas de fraude : interrompre le passage et alerter la direction sans délai'] },
    ];
  },

  consignesJury() {
    const p = AppData.params, blocs = this._getConsignes();
    const html = `
      <div class="print-page consignes-page">
        ${this._entete('CONSIGNES JURY', 'Épreuve orale du DNB')}
        <h3 class="consignes-titre">Déroulement de l'épreuve orale</h3>
        <p class="consignes-intro">L'épreuve orale du Diplôme National du Brevet évalue la capacité du candidat à présenter et défendre un exposé construit à partir d'un sujet choisi en lien avec les enseignements.</p>
        <div class="consignes-grid">
          ${blocs.map(b=>`<div class="consigne-bloc"><h4>${this._esc(b.titre)}</h4><ul>${(b.items||[]).map(it=>`<li>${this._esc(it)}</li>`).join('')}</ul></div>`).join('')}
        </div>
        <div class="consignes-footer">
          <p>Merci de votre engagement pour cet examen. La direction reste disponible toute la journée.</p>
          <p><em>${this._esc(p.etablissement)} — Année scolaire ${this._esc(p.annee)}</em></p>
        </div>
      </div>`;
    const _nbElevC = AppData.affectation.reduce((s,c) => s + c.eleveIds.length, 0);
    const _garde5  = this._bandeauGarde('Consignes jury', 1, _nbElevC);
    this._imprimer(_garde5 + html);
  },

  // ─────────────────────────────────────────────────────────────
  // ÉDITEUR CONSIGNES (intégré dans la modal params impression)
  // ─────────────────────────────────────────────────────────────

  _renderEditeurContenu(blocs) {
    const container = document.getElementById('consignes-editor-content'); if (!container) return;
    container.innerHTML = blocs.map((bloc, bi) => `
      <div class="consigne-edit-bloc" data-bloc="${bi}">
        <div class="consigne-edit-titre-row">
          <input type="text" class="consigne-edit-titre" value="${this._esc(bloc.titre)}" placeholder="Titre du bloc…" data-bloc="${bi}" />
          <button class="btn btn-icon btn-del consigne-del-bloc" data-bloc="${bi}" title="Supprimer ce bloc">🗑</button>
        </div>
        <div class="consigne-edit-items" data-bloc="${bi}">
          ${(bloc.items||[]).map((item,ii)=>`
            <div class="consigne-edit-item-row" data-item="${ii}">
              <span class="consigne-edit-bullet">•</span>
              <input type="text" class="consigne-edit-item" value="${this._esc(item)}" placeholder="Consigne…" data-bloc="${bi}" data-item="${ii}" />
              <button class="btn btn-icon btn-del consigne-del-item" data-bloc="${bi}" data-item="${ii}" title="Supprimer">✕</button>
            </div>`).join('')}
        </div>
        <button class="btn btn-sm consigne-add-item" data-bloc="${bi}">+ Ajouter une ligne</button>
      </div>`).join('') +
      `<button class="btn btn-outline consigne-add-bloc" style="width:100%;margin-top:.75rem">+ Ajouter un bloc</button>`;
    this._bindEditeurEvents(container);
  },

  _bindEditeurEvents(container) {
    container.querySelectorAll('.consigne-del-bloc').forEach(btn => btn.addEventListener('click', () => {
      const b = this._lireEditeur(); b.splice(parseInt(btn.dataset.bloc),1); this._renderEditeurContenu(b);
    }));
    container.querySelectorAll('.consigne-del-item').forEach(btn => btn.addEventListener('click', () => {
      const b = this._lireEditeur(); b[parseInt(btn.dataset.bloc)].items.splice(parseInt(btn.dataset.item),1); this._renderEditeurContenu(b);
    }));
    container.querySelectorAll('.consigne-add-item').forEach(btn => btn.addEventListener('click', () => {
      const b = this._lireEditeur(), bi = parseInt(btn.dataset.bloc);
      b[bi].items.push(''); this._renderEditeurContenu(b);
      const inputs = container.querySelectorAll(`.consigne-edit-item[data-bloc="${bi}"]`);
      if (inputs.length) inputs[inputs.length-1].focus();
    }));
    container.querySelector('.consigne-add-bloc')?.addEventListener('click', () => {
      const b = this._lireEditeur(); b.push({ titre:'Nouveau bloc', items:[''] }); this._renderEditeurContenu(b);
    });
  },

  /**
   * Lit l'état de l'éditeur de consignes.
   * [BUG-5 FIX] filtreVides=false par défaut pour les appels intermédiaires :
   * les lignes vides sont conservées pendant l'édition (l'utilisateur peut les remplir).
   * filtreVides=true uniquement lors de la sauvegarde finale (sauvegarderParamsImpression).
   */
  _lireEditeur(filtreVides = false) {
    const container = document.getElementById('consignes-editor-content'); if (!container) return [];
    const blocs = [];
    container.querySelectorAll('.consigne-edit-bloc').forEach(blocEl => {
      const titre = blocEl.querySelector('.consigne-edit-titre')?.value || '';
      const items = [];
      blocEl.querySelectorAll('.consigne-edit-item').forEach(inp => {
        // En mode intermédiaire, conserver les items vides pour ne pas les effacer
        if (filtreVides ? inp.value.trim() : true) {
          items.push(inp.value.trim());
        }
      });
      blocs.push({ titre, items });
    });
    return blocs;
  },

  reinitialiserConsignes() {
    if (!confirm('Remettre les consignes par défaut ?')) return;
    AppData.params.consignesJury = null;
    this._renderEditeurContenu(this._getConsignes());
    notifier('Consignes réinitialisées.', 'info');
  },

  // ─────────────────────────────────────────────────────────────
  // PARAMÈTRES D'IMPRESSION — modal centrale
  // ─────────────────────────────────────────────────────────────

  ouvrirParamsImpression() {
    const cfg = PrintConfig.get();

    // Signataire : le select encode "Libellé|Genre"
    const fonctionVal = cfg.fonctionSign + '|' + cfg.genreSign;
    const selectFn = document.getElementById('pi-fonction');
    if (selectFn) {
      const optMatch = [...selectFn.options].find(o => o.value === fonctionVal);
      selectFn.value = optMatch ? fonctionVal : cfg.fonctionSign;
    }
    // Sync des radios genre (affichage uniquement — la valeur authoritative est dans le select)
    const radioM = document.getElementById('pi-genre-m');
    const radioF = document.getElementById('pi-genre-f');
    if (radioM) radioM.checked = cfg.genreSign !== 'F';
    if (radioF) radioF.checked = cfg.genreSign === 'F';

    _setVal('pi-nom', cfg.nomSign);
    _setVal('pi-date', cfg.dateSign);

    _updatePreview('pi-logo-preview', cfg.logoBase64, 'Logo');
    _updatePreview('pi-sign-preview', cfg.signatureBase64, 'Signature');

    _setCheck('pi-ce-sujet',   cfg.convocEleve.afficherSujet);
    _setCheck('pi-ce-parcours',cfg.convocEleve.afficherParcours);
    _setCheck('pi-ce-langue',  cfg.convocEleve.afficherLangue);
    _setCheck('pi-ce-amem',    cfg.convocEleve.afficherAmenagement);
    _setCheck('pi-ce-binome',  cfg.convocEleve.afficherBinome);

    [0,1,2,3,4].forEach(i => _setCheck(`pi-ce-consigne-${i}`, !(cfg.convocEleve.consignesSuppr||[]).includes(i)));

    const extraContainer = document.getElementById('pi-ce-extras');
    if (extraContainer) {
      extraContainer.innerHTML = '';
      (cfg.convocEleve.consignesExtra||[]).forEach((txt,i) => _ajouterLigneExtra(extraContainer, txt, i));
    }

    _setCheck('pi-cj-sujet',   cfg.convocJury.afficherSujet);
    _setCheck('pi-cj-pauses',  cfg.convocJury.afficherPauses);
    _setCheck('pi-cj-remarque',cfg.convocJury.afficherRemarque);
    _setVal('pi-cj-remarque-texte', cfg.convocJury.remarqueTexte);

    // Afficher/masquer la zone texte remarque selon l'état de la checkbox
    const zoneRemarque = document.getElementById('pi-cj-remarque-zone');
    if (zoneRemarque) zoneRemarque.style.display = cfg.convocJury.afficherRemarque ? '' : 'none';

    _setCheck('pi-re-sujet',  cfg.recap.afficherSujet);
    _setCheck('pi-re-langue', cfg.recap.afficherLangue);
    _setCheck('pi-re-classe', cfg.recap.afficherClasse);

    _setCheck('pi-em-sujet', cfg.emargement.afficherSujet);
    _setCheck('pi-em-amem',  cfg.emargement.afficherAmem);
    _setCheck('pi-em-note',  cfg.emargement.colonneNote);

    this._renderEditeurContenu(this._getConsignes());
  },

  sauvegarderParamsImpression() {
    const existant = PrintConfig.get();

    // Lire le genre depuis le select (authoritative)
    const selectVal   = _getVal('pi-fonction');
    const fonctionSign = selectVal.split('|')[0] || 'Principal adjoint';
    const genreSign    = selectVal.split('|')[1] || 'M';

    const cfg = {
      logoBase64      : existant.logoBase64,
      signatureBase64 : existant.signatureBase64,
      fonctionSign,
      genreSign,
      nomSign         : _getVal('pi-nom'),
      dateSign        : _getVal('pi-date'),
      convocEleve : {
        afficherSujet       : _getCheck('pi-ce-sujet'),
        afficherParcours    : _getCheck('pi-ce-parcours'),
        afficherLangue      : _getCheck('pi-ce-langue'),
        afficherAmenagement : _getCheck('pi-ce-amem'),
        afficherBinome      : _getCheck('pi-ce-binome'),
        consignesSuppr      : [0,1,2,3,4].filter(i => !_getCheck(`pi-ce-consigne-${i}`)),
        consignesExtra      : _lireExtras(),
      },
      convocJury : {
        afficherSujet    : _getCheck('pi-cj-sujet'),
        afficherPauses   : _getCheck('pi-cj-pauses'),
        afficherRemarque : _getCheck('pi-cj-remarque'),
        remarqueTexte    : _getVal('pi-cj-remarque-texte'),
      },
      recap : {
        afficherSujet  : _getCheck('pi-re-sujet'),
        afficherLangue : _getCheck('pi-re-langue'),
        afficherClasse : _getCheck('pi-re-classe'),
      },
      emargement : {
        afficherSujet : _getCheck('pi-em-sujet'),
        afficherAmem  : _getCheck('pi-em-amem'),
        colonneNote   : _getCheck('pi-em-note'),
      },
    };

    // Sauvegarder les consignes éditées (filtreVides=true : items vides exclus)
    AppData.params.consignesJury = this._lireEditeur(true);
    PrintConfig.set(cfg);
    if (typeof notifier === 'function') notifier('Paramètres d\'impression sauvegardés.', 'success');
  },

  // ─────────────────────────────────────────────────────────────
  // 6. LISTING ALPHABÉTIQUE — A3 portrait, très visible, affichage hall
  // ─────────────────────────────────────────────────────────────

  listingAlphabetique() {
    if (AppData.affectation.length === 0) {
      notifier("Lancez l'affectation avant d'imprimer le listing.", 'warning'); return;
    }

    // Construire la liste triée alphabétiquement
    const candidats = [];
    AppData.affectation.forEach(c => {
      const jury = AppData.getJury(c.juryId);
      c.eleveIds.forEach(id => {
        const e = AppData.getEleve(id);
        if (!e) return;
        candidats.push({
          nom       : e.nom,
          prenom    : e.prenom,
          classe    : e.classe,
          heure     : c.heureDebut,
          juryNom   : jury ? jury.nom : '—',
          salle     : jury ? jury.salle : '—',
          amenagement: e.amenagement,
          prioritaire: e.prioritaire,
          isBinome  : c.isBinome,
        });
      });
    });

    if (!candidats.length) { notifier('Aucun candidat affecté.', 'warning'); return; }

    // Tri : NOM puis Prénom
    candidats.sort((a, b) => {
      const n = a.nom.localeCompare(b.nom, 'fr');
      return n !== 0 ? n : a.prenom.localeCompare(b.prenom, 'fr');
    });

    const p   = AppData.params;
    const cfg = PrintConfig.get();

    // Date de l'épreuve
    let dateStr = '';
    if (p.dateEpreuve) {
      try {
        const d = new Date(p.dateEpreuve + 'T12:00:00');
        dateStr = d.toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
        dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
      } catch { dateStr = p.dateEpreuve; }
    }

    const typeLabel = p.typeEpreuve === 'DNB_BLANC'
      ? 'DNB — Blanc' : 'Diplôme National du Brevet';

    const logoHtml = cfg.logoBase64
      ? `<img src="${cfg.logoBase64}" class="listing-logo" alt="Logo" />`
      : '';

    // Un seul bloc continu — le navigateur gère la pagination naturellement.
    // Le <thead> avec repeat-header assure que l'en-tête de colonne
    // se répète sur chaque page imprimée sans aucun saut forcé.
    const nbPages = 1; // 1 seul bloc, pagination naturelle

    const toutesLignes = candidats.map((c, i) => {
      const rang = i + 1;
      const flags = [];
      if (c.amenagement) flags.push('<span class="listing-badge-amem">1/3 tps</span>');
      if (c.prioritaire)  flags.push('<span class="listing-badge-prio">Prior.</span>');
      const parity = rang % 2 === 0 ? 'listing-row-even' : '';
      return `<tr class="listing-row ${parity}">
        <td class="listing-cell-rang">${rang}</td>
        <td class="listing-cell-nom"><strong>${this._esc(c.nom)}</strong> ${this._esc(c.prenom)} ${flags.join('')}</td>
        <td class="listing-cell-classe">${this._esc(c.classe)}</td>
        <td class="listing-cell-heure">${this._esc(c.heure)}</td>
        <td class="listing-cell-salle"><strong>${this._esc(c.salle)}</strong></td>
        <td class="listing-cell-jury">${this._esc(c.juryNom)}</td>
      </tr>`;
    }).join('');

    // Un seul print-page-a3p : pas de page-break-after intermédiaire
    // Le thead repeat-header (via CSS) répète les colonnes sur chaque feuille imprimée
    const pages = `
      <div class="print-page-a3p listing-page-continue">
        <div class="listing-header">
          <div class="listing-header-left">
            ${logoHtml}
            <div>
              <div class="listing-etab">${this._esc(p.etablissement)}</div>
              <div class="listing-annee">Année scolaire ${this._esc(p.annee)}</div>
            </div>
          </div>
          <div class="listing-header-center">
            <div class="listing-titre">${this._esc(typeLabel)}</div>
            <div class="listing-sous-titre">LISTE DES CANDIDATS — ORDRE ALPHABÉTIQUE</div>
            ${dateStr ? `<div class="listing-date">${this._esc(dateStr)}</div>` : ''}
          </div>
          <div class="listing-header-right">
            <div class="listing-total-label">Total : <strong>${candidats.length}</strong> candidats</div>
          </div>
        </div>
        <table class="listing-table">
          <thead>
            <tr>
              <th class="listing-th-rang">#</th>
              <th class="listing-th-nom">Nom — Prénom</th>
              <th class="listing-th-classe">Classe</th>
              <th class="listing-th-heure">Heure de passage</th>
              <th class="listing-th-salle">Salle</th>
              <th class="listing-th-jury">Jury</th>
            </tr>
          </thead>
          <tbody>${toutesLignes}</tbody>
        </table>
      </div>`;

    const _garde6 = this._bandeauGarde('Listing alphabétique (A3)', candidats.length, candidats.length);
    // Injecter le bandeau dans le listing-header
    const _pages6 = pages.replace(/(<div class="listing-header">)/, _garde6 + '$1');
    this._imprimer(_pages6);
  },


  // ─────────────────────────────────────────────────────────────
  // 7. AFFICHES PORTES — A4 paysage, 1 page par salle
  // ─────────────────────────────────────────────────────────────

  affichesPortes() {
    if (AppData.affectation.length === 0) {
      notifier("Lancez l'affectation avant d'imprimer les affiches.", 'warning'); return;
    }

    const p   = AppData.params;
    const cfg = PrintConfig.get();

    let dateStr = '';
    if (p.dateEpreuve) {
      try {
        const d = new Date(p.dateEpreuve + 'T12:00:00');
        dateStr = d.toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
        dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
      } catch { dateStr = p.dateEpreuve; }
    }

    const logoHtml = cfg.logoBase64
      ? `<img src="${cfg.logoBase64}" class="affiche-logo" alt="Logo" />`
      : '';

    let pages = '';
    let nbAffiches = 0;

    AppData.jurys.forEach((jury, ji) => {
      const creneaux = AppData.affectation.filter(c => c.juryId === jury.id).sort((a,b)=>a.ordre-b.ordre);
      if (!creneaux.length) return;

      const nbCandidats = creneaux.reduce((s,c) => s + c.eleveIds.length, 0);
      const hDebut  = creneaux[0].heureDebut;
      const hFinale = creneaux[creneaux.length-1].heureFin;

      // Numéro de jury (rang dans la liste des jurys utilisés)
      const juryNum = ji + 1;

      // Membres du jury
      const membres = jury.nom.split('/').map(m => m.trim()).filter(Boolean);

      // Pauses actives
      const pausesStr = (p.pauses||[])
        .filter(pa => pa.active && pa.duree > 0)
        .map(pa => `${pa.heure} (${pa.duree} min)`)
        .join('  ·  ') || 'Aucune';

      nbAffiches++;
      pages += `
        <div class="print-page print-page-a4l affiche-porte">
          <div class="affiche-top-band">
            ${logoHtml}
            <div class="affiche-etab-bloc">
              <span class="affiche-etab">${this._esc(p.etablissement)}</span>
              <span class="affiche-epreuve">Oral DNB ${this._esc(p.annee)}</span>
            </div>
            ${dateStr ? `<div class="affiche-date-band">${this._esc(dateStr)}</div>` : ''}
          </div>

          <div class="affiche-corps">
            <div class="affiche-salle-bloc">
              <div class="affiche-salle-label">SALLE</div>
              <div class="affiche-salle-num">${this._esc(jury.salle)}</div>
            </div>

            <div class="affiche-jury-bloc">
              <div class="affiche-jury-label">JURY N°</div>
              <div class="affiche-jury-num">${juryNum}</div>
              ${jury.langue ? `<div class="affiche-langue">${this._esc(jury.langue)}</div>` : ''}
            </div>
          </div>
        </div>`;
    });

    if (!pages) { notifier('Aucun jury avec des candidats.', 'warning'); return; }
    this._imprimer(pages);
  },

};

// ─────────────────────────────────────────────────────────────
// Helpers locaux (fonctions utilitaires pour la modal)
// ─────────────────────────────────────────────────────────────

function _setVal(id, v)     { const el=document.getElementById(id); if(el) el.value=v||''; }
function _getVal(id)        { return (document.getElementById(id)?.value||'').trim(); }
function _setCheck(id, v)   { const el=document.getElementById(id); if(el) el.checked=!!v; }
function _getCheck(id)      { return !!document.getElementById(id)?.checked; }

function _updatePreview(previewId, src, label) {
  const el = document.getElementById(previewId);
  if (!el) return;
  if (src) {
    el.innerHTML = `<img src="${src}" alt="${label}" style="max-height:60px;max-width:160px;object-fit:contain;border-radius:4px;border:1px solid #e2e8f0;" />`;
  } else {
    el.innerHTML = `<span class="pi-no-image">Aucun fichier chargé</span>`;
  }
}

function _ajouterLigneExtra(container, txt, i) {
  const esc = (typeof window.escHtml === 'function') ? window.escHtml : s => String(s||'');
  const div = document.createElement('div');
  div.className = 'pi-extra-row';
  div.innerHTML = `<span class="consigne-edit-bullet">+</span>
    <input type="text" class="consigne-edit-item pi-extra-input" value="${esc(txt)}" placeholder="Consigne supplémentaire…" />
    <button class="btn btn-icon btn-del pi-extra-del" title="Supprimer">✕</button>`;
  div.querySelector('.pi-extra-del').addEventListener('click', () => div.remove());
  container.appendChild(div);
}

function _lireExtras() {
  return [...document.querySelectorAll('.pi-extra-input')].map(i=>i.value.trim()).filter(Boolean);
}

// ─────────────────────────────────────────────────────────────
// Init événements de la modal paramètres impression
// ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // ── Toggle panneau paramètres d'impression (Rev.7 — inline, non modal) ──
  const piToggle = document.getElementById('pi-panel-toggle');
  const piBody   = document.getElementById('pi-panel-body');
  const piChevron = document.getElementById('pi-chevron');
  if (piToggle && piBody) {
    piToggle.addEventListener('click', () => {
      const ouvert = piBody.hidden === false;
      piBody.hidden = ouvert;
      piToggle.setAttribute('aria-expanded', String(!ouvert));
      if (piChevron) piChevron.textContent = ouvert ? '▸' : '▾';
      // Charger les paramètres à la première ouverture
      if (!ouvert) Print.ouvrirParamsImpression();
    });
  }

  // Sauvegarder — un seul listener
  document.getElementById('btn-params-impression-sauv')?.addEventListener('click', () => Print.sauvegarderParamsImpression());

  // Réinitialiser consignes — un seul listener (suppression du doublon)
  document.getElementById('btn-consignes-reset')?.addEventListener('click', () => Print.reinitialiserConsignes());

  // Upload logo
  document.getElementById('pi-logo-input')?.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const b64 = ev.target.result;
      if (!AppData.params.impression) AppData.params.impression = {};
      AppData.params.impression.logoBase64 = b64;
      _updatePreview('pi-logo-preview', b64, 'Logo');
    };
    reader.readAsDataURL(file);
  });

  // Supprimer logo
  document.getElementById('pi-logo-del')?.addEventListener('click', () => {
    if (!AppData.params.impression) AppData.params.impression = {};
    AppData.params.impression.logoBase64 = null;
    _updatePreview('pi-logo-preview', null, 'Logo');
    const inp = document.getElementById('pi-logo-input'); if(inp) inp.value='';
  });

  // Upload signature
  document.getElementById('pi-sign-input')?.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const b64 = ev.target.result;
      if (!AppData.params.impression) AppData.params.impression = {};
      AppData.params.impression.signatureBase64 = b64;
      _updatePreview('pi-sign-preview', b64, 'Signature');
    };
    reader.readAsDataURL(file);
  });

  // Supprimer signature
  document.getElementById('pi-sign-del')?.addEventListener('click', () => {
    if (!AppData.params.impression) AppData.params.impression = {};
    AppData.params.impression.signatureBase64 = null;
    _updatePreview('pi-sign-preview', null, 'Signature');
    const inp = document.getElementById('pi-sign-input'); if(inp) inp.value='';
  });

  // Ajouter une consigne extra
  document.getElementById('pi-ce-add-extra')?.addEventListener('click', () => {
    const container = document.getElementById('pi-ce-extras');
    if (container) _ajouterLigneExtra(container, '', container.children.length);
  });

  // Toggle afficher/masquer le champ texte de la remarque jury
  document.getElementById('pi-cj-remarque')?.addEventListener('change', e => {
    const zone = document.getElementById('pi-cj-remarque-zone');
    if (zone) zone.style.display = e.target.checked ? '' : 'none';
  });

  // Sync radio genre ↔ select (affichage seulement)
  document.getElementById('pi-fonction')?.addEventListener('change', e => {
    const genre = e.target.value.split('|')[1] || 'M';
    const radioM = document.getElementById('pi-genre-m');
    const radioF = document.getElementById('pi-genre-f');
    if (radioM) radioM.checked = genre !== 'F';
    if (radioF) radioF.checked = genre === 'F';
  });
});
window.Print = Print;
window.PrintConfig = PrintConfig;
