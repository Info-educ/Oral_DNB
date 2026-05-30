/**
 * print.js — Génération et impression des documents officiels
 * Oral DNB · Collège Joliot Curie  —  Rev.8
 *
 * Corrections Rev.8 (audit senior) :
 *   [BUG-5] _lireEditeur() filtrait les items vides en édition intermédiaire
 *           → le filtre est maintenant appliqué UNIQUEMENT à la sauvegarde finale
 *           → les lignes vides restent visibles pendant l'édition (comportement attendu)
 *
 * Conservé de Rev.6 :
 *   — _esc2 remplacée par window.escHtml (défini dans ui.js)
 *   — Doublon listener btn-consignes-reset supprimé (une seule déclaration)
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
    const zone = document.getElementById('print-zone');
    if (!zone) { console.error('[Print] #print-zone introuvable'); return; }
    zone.innerHTML = html;
    window.print();
    setTimeout(() => { zone.innerHTML = ''; }, 2000);
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

    return `<div class="garde-bandeau">
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
    </div>`;
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

    // Bandeau de garde injecté en tête de la première page (pas de page séparée)
    const _garde1 = this._bandeauGarde('Convocations élèves', elevesAffectes.length, elevesAffectes.length);
    const _pages1 = pages.replace(/(<div class="print-page convocation-eleve">)/, _garde1 + '$1');
    this._imprimer(_pages1);
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
    const _pages2   = pages.replace(/(<div class="print-page convocation-jury">)/, _garde2 + '$1');
    this._imprimer(_pages2);
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
    const _html3   = html.replace(/(<div class="print-page recap-page">)/, '$1' + _garde3);
    this._imprimer(_html3);
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
    const _html4   = html.replace(/(<div class="print-page emarg-page">)/, '$1' + _garde4);
    this._imprimer(_html4);
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
    const _html5   = html.replace(/(<div class="print-page consignes-page">)/, '$1' + _garde5);
    this._imprimer(_html5);
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

    if (typeof ouvrirModal === 'function') {
      // La modal d'impression est supprimée en Rev.7 — le panneau est inline
      // ouvrirModal('modal-params-impression');
    }
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

    // Sauvegarder les consignes éditées dans la même modal
    AppData.params.consignesJury = this._lireEditeur(true); // filtreVides=true : ne sauvegarder que les items renseignés
    PrintConfig.set(cfg);
    // Rev.7 : panneau inline, pas de modale à fermer
    // if (typeof fermerModal === 'function') fermerModal('modal-params-impression');
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
