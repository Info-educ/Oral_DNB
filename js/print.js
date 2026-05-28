/**
 * print.js — Génération et impression des 5 documents officiels
 * Oral DNB · Collège Joliot Curie  —  Brique 4
 *
 * Documents :
 *   1. Convocations élèves  (une page par candidat)
 *   2. Convocations jurys   (planning complet du jury)
 *   3. Récapitulatif        (tous les candidats par jury)
 *   4. Feuille d'émargement (signatures)
 *   5. Consignes jury       (rappels réglementaires)
 *
 * Technique :
 *   - Génération HTML dans #print-zone (masqué à l'écran)
 *   - window.print() + @media print dans style.css
 *   - Aucune dépendance externe
 */

'use strict';

const Print = {

  // ──────────────────────────────────────────────────────────────
  // UTILITAIRES INTERNES
  // ──────────────────────────────────────────────────────────────

  /** Injecte le HTML dans la zone d'impression et ouvre la boîte d'impression. */
  _imprimer(html) {
    const zone = document.getElementById('print-zone');
    if (!zone) { console.error('[Print] #print-zone introuvable'); return; }
    zone.innerHTML = html;
    window.print();
    // Nettoyage différé (après fermeture de la boîte d'impression)
    setTimeout(() => { zone.innerHTML = ''; }, 2000);
  },

  /** En-tête commune à tous les documents */
  _entete(titre, sousTitre = '') {
    const p = AppData.params;
    return `
      <div class="print-header">
        <div class="print-header-left">
          <div class="print-etab">${this._esc(p.etablissement)}</div>
          <div class="print-annee">Année scolaire ${this._esc(p.annee)}</div>
        </div>
        <div class="print-header-center">
          <div class="print-titre">DIPLÔME NATIONAL DU BREVET</div>
          <div class="print-sous-titre">ORAL</div>
        </div>
        <div class="print-header-right">
          <div class="print-doc-titre">${titre}</div>
          ${sousTitre ? `<div class="print-doc-sous">${sousTitre}</div>` : ''}
        </div>
      </div>
      <hr class="print-hr" />
    `;
  },

  _esc(str) {
    return String(str||'')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },

  _convocHeure(heureDebut) {
    return AppData.soustraireMinutes(heureDebut, AppData.params.convocAvant);
  },

  _nomEleve(e) { return `${this._esc(e.nom)} ${this._esc(e.prenom)}`; },

  // ──────────────────────────────────────────────────────────────
  // 1. CONVOCATIONS ÉLÈVES
  // ──────────────────────────────────────────────────────────────

  convocationsEleves() {
    if (AppData.affectation.length === 0) {
      notifier('Lancez l\'affectation avant d\'imprimer les convocations.', 'warning');
      return;
    }

    let pages = '';

    AppData.eleves.forEach(eleve => {
      const creneau = AppData.affectation.find(c => c.eleveIds.includes(eleve.id));
      if (!creneau) return; // élève non affecté

      const jury      = AppData.getJury(creneau.juryId);
      const hConvoc   = this._convocHeure(creneau.heureDebut);
      const partenaire = creneau.isBinome
        ? AppData.getEleve(creneau.eleveIds.find(id => id !== eleve.id))
        : null;

      pages += `
        <div class="print-page convocation-eleve">
          ${this._entete('CONVOCATION', 'Candidat(e)')}

          <div class="convoc-bloc-eleve">
            <div class="convoc-nom">${this._nomEleve(eleve)}</div>
            <div class="convoc-classe">Classe : <strong>${this._esc(eleve.classe)}</strong></div>
            ${eleve.amenagement ? '<div class="convoc-badge-amem">⏱ Bénéficiaire d\'un tiers-temps</div>' : ''}
            ${partenaire ? `<div class="convoc-binome">Passage en binôme avec : <strong>${this._nomEleve(partenaire)}</strong></div>` : ''}
          </div>

          <table class="convoc-table">
            <tr>
              <th>Heure de convocation</th>
              <th>Heure de passage</th>
              <th>Durée</th>
              <th>Salle</th>
            </tr>
            <tr>
              <td class="convoc-heure-convoc"><strong>${hConvoc}</strong></td>
              <td class="convoc-heure-passage">${creneau.heureDebut}</td>
              <td>${creneau.duree} min</td>
              <td><strong>${jury ? this._esc(jury.salle) : '?'}</strong></td>
            </tr>
          </table>

          <div class="convoc-consignes-eleve">
            <p><strong>Consignes :</strong></p>
            <ul>
              <li>Présentez-vous à l'heure de <strong>convocation</strong> indiquée (et non à l'heure de passage).</li>
              <li>Apportez votre carnet de correspondance ou pièce d'identité.</li>
              <li>Apportez votre <strong>exposé préparé</strong> (document de présentation autorisé).</li>
              <li>Les téléphones portables doivent être éteints et rangés.</li>
              <li>Aucun document supplémentaire ne sera fourni par le jury.</li>
            </ul>
          </div>

          <div class="convoc-footer">
            <div class="convoc-signature">
              <p>Fait à Bagneux, le ___________________</p>
              <p>Le Principal</p>
              <br /><br />
              <p>Cachet de l'établissement :</p>
            </div>
          </div>
        </div>
      `;
    });

    if (!pages) { notifier('Aucun élève affecté à imprimer.', 'warning'); return; }
    this._imprimer(pages);
  },

  // ──────────────────────────────────────────────────────────────
  // 2. CONVOCATIONS JURYS
  // ──────────────────────────────────────────────────────────────

  convocationsJurys() {
    if (AppData.affectation.length === 0) {
      notifier('Lancez l\'affectation avant d\'imprimer les convocations jury.', 'warning');
      return;
    }

    let pages = '';

    AppData.jurys.forEach(jury => {
      const creneaux = AppData.affectation
        .filter(c => c.juryId === jury.id)
        .sort((a,b) => a.ordre - b.ordre);

      if (creneaux.length === 0) return;

      const lignes = creneaux.map(c => {
        const noms = c.eleveIds.map(id => {
          const e = AppData.getEleve(id);
          return e ? `${this._esc(e.nom)} ${this._esc(e.prenom)}` : '?';
        }).join('<br/>');
        const classes = c.eleveIds.map(id => {
          const e = AppData.getEleve(id);
          return e ? this._esc(e.classe) : '';
        }).join(' / ');
        const flags = c.eleveIds.map(id => {
          const e = AppData.getEleve(id);
          if (!e) return '';
          const f = [];
          if (e.amenagement) f.push('1/3 tps');
          if (e.prioritaire)  f.push('Prior.');
          return f.join(', ');
        }).filter(Boolean).join(' | ');

        return `
          <tr>
            <td class="text-center">${c.ordre}</td>
            <td>${c.heureDebut}</td>
            <td>${c.heureFin}</td>
            <td class="text-center">${c.duree} min</td>
            <td>${noms}</td>
            <td>${classes}</td>
            <td class="text-center">${c.isBinome ? 'Oui' : ''}</td>
            <td>${flags}</td>
          </tr>
        `;
      }).join('');

      const hFinale = creneaux[creneaux.length-1].heureFin;
      const hDebut  = creneaux[0].heureDebut;

      pages += `
        <div class="print-page convocation-jury">
          ${this._entete('CONVOCATION JURY', `${this._esc(jury.nom)} — Salle ${this._esc(jury.salle)}`)}

          <div class="jury-info-grid">
            <div><span class="label">Enseignant :</span> <strong>${this._esc(jury.nom)}</strong></div>
            <div><span class="label">Matière :</span> ${this._esc(jury.matiere)}</div>
            <div><span class="label">Salle :</span> <strong>${this._esc(jury.salle)}</strong></div>
            <div><span class="label">Langue vivante :</span> ${this._esc(jury.lv)} ${jury.langueDetail ? '('+this._esc(jury.langueDetail)+')' : ''}</div>
            <div><span class="label">Début :</span> ${hDebut}</div>
            <div><span class="label">Fin prévisionnelle :</span> ${hFinale}</div>
            <div><span class="label">Nombre de candidats :</span> ${creneaux.reduce((s,c)=>s+c.eleveIds.length,0)}</div>
          </div>

          <h3 class="print-section-titre">Planning des passages</h3>
          <table class="print-table">
            <thead>
              <tr>
                <th>#</th><th>Début</th><th>Fin</th><th>Durée</th>
                <th>Candidat(s)</th><th>Classe</th><th>Binôme</th><th>Particularités</th>
              </tr>
            </thead>
            <tbody>${lignes}</tbody>
          </table>

          <div class="jury-remarques">
            <strong>Remarques :</strong> En cas d'empêchement ou de question, contactez immédiatement le secrétariat.
            ${(AppData.params.pauses||[]).filter(p=>p.active&&p.duree>0).map(p=>`Pause ${this._esc(p.heure)} (${p.duree} min)`).join(', ') || 'Aucune pause planifiée'}..
          </div>
        </div>
      `;
    });

    if (!pages) { notifier('Aucun créneau affecté à imprimer.', 'warning'); return; }
    this._imprimer(pages);
  },

  // ──────────────────────────────────────────────────────────────
  // 3. RÉCAPITULATIF CANDIDATS PAR JURY
  // ──────────────────────────────────────────────────────────────

  recapitulatif() {
    if (AppData.affectation.length === 0) {
      notifier('Lancez l\'affectation avant d\'imprimer le récapitulatif.', 'warning');
      return;
    }

    const date = new Date().toLocaleDateString('fr-FR', {day:'2-digit',month:'long',year:'numeric'});
    let html = `
      <div class="print-page recap-page">
        ${this._entete('RÉCAPITULATIF', 'Candidats par jury')}
        <p class="recap-date">Édité le ${date} — ${AppData.nbEleves()} candidat(s) — ${AppData.nbJurys()} jury(s)</p>
    `;

    AppData.jurys.forEach(jury => {
      const creneaux = AppData.affectation.filter(c => c.juryId === jury.id).sort((a,b)=>a.ordre-b.ordre);
      if (creneaux.length === 0) return;

      const lignes = creneaux.map(c => {
        return c.eleveIds.map(id => {
          const e = AppData.getEleve(id);
          if (!e) return '';
          const flags = [];
          if (e.amenagement) flags.push('1/3 tps');
          if (e.prioritaire)  flags.push('Prioritaire');
          if (c.isBinome)     flags.push('Binôme');
          return `
            <tr>
              <td>${c.ordre}</td>
              <td>${c.heureDebut}</td>
              <td>${c.heureFin}</td>
              <td><strong>${this._esc(e.nom)}</strong></td>
              <td>${this._esc(e.prenom)}</td>
              <td>${this._esc(e.classe)}</td>
              <td>${this._esc(e.lv)}</td>
              <td>${flags.join(', ')}</td>
            </tr>`;
        }).join('');
      }).join('');

      html += `
        <div class="recap-jury-bloc">
          <div class="recap-jury-titre">
            Jury : <strong>${this._esc(jury.nom)}</strong> — Salle <strong>${this._esc(jury.salle)}</strong>
            — ${this._esc(jury.matiere)} — ${this._esc(jury.lv)}
            ${jury.langueDetail ? '('+this._esc(jury.langueDetail)+')' : ''}
          </div>
          <table class="print-table">
            <thead>
              <tr><th>#</th><th>Début</th><th>Fin</th><th>Nom</th><th>Prénom</th><th>Classe</th><th>LV</th><th>Particularités</th></tr>
            </thead>
            <tbody>${lignes}</tbody>
          </table>
        </div>
      `;
    });

    html += '</div>';
    this._imprimer(html);
  },

  // ──────────────────────────────────────────────────────────────
  // 4. FEUILLE D'ÉMARGEMENT
  // ──────────────────────────────────────────────────────────────

  feuilleEmargement() {
    if (AppData.affectation.length === 0) {
      notifier('Lancez l\'affectation avant d\'imprimer la feuille d\'émargement.', 'warning');
      return;
    }

    let html = '';

    AppData.jurys.forEach(jury => {
      const creneaux = AppData.affectation.filter(c => c.juryId === jury.id).sort((a,b)=>a.ordre-b.ordre);
      if (creneaux.length === 0) return;

      const lignes = creneaux.map(c => {
        return c.eleveIds.map(id => {
          const e = AppData.getEleve(id);
          if (!e) return '';
          return `
            <tr class="emarg-ligne">
              <td>${c.heureDebut}</td>
              <td><strong>${this._esc(e.nom)}</strong></td>
              <td>${this._esc(e.prenom)}</td>
              <td>${this._esc(e.classe)}</td>
              <td>${this._esc(e.lv)}</td>
              <td>${e.amenagement ? '1/3 tps' : ''}</td>
              <td class="emarg-signature"></td>
              <td class="emarg-note"></td>
            </tr>`;
        }).join('');
      }).join('');

      html += `
        <div class="print-page emarg-page">
          ${this._entete('FEUILLE D\'ÉMARGEMENT', `Jury : ${this._esc(jury.nom)} — Salle ${this._esc(jury.salle)}`)}

          <div class="jury-info-grid small">
            <div><span class="label">Enseignant :</span> <strong>${this._esc(jury.nom)}</strong></div>
            <div><span class="label">Salle :</span> <strong>${this._esc(jury.salle)}</strong></div>
            <div><span class="label">LV :</span> ${this._esc(jury.lv)} ${jury.langueDetail?'('+this._esc(jury.langueDetail)+')':''}</div>
            <div><span class="label">Nb candidats :</span> ${creneaux.reduce((s,c)=>s+c.eleveIds.length,0)}</div>
          </div>

          <table class="print-table emarg-table">
            <thead>
              <tr>
                <th>Heure</th><th>Nom</th><th>Prénom</th><th>Classe</th>
                <th>LV</th><th>Amén.</th>
                <th style="width:80px">Signature élève</th>
                <th style="width:60px">Note jury</th>
              </tr>
            </thead>
            <tbody>${lignes}</tbody>
          </table>

          <div class="emarg-certif">
            <p>Je soussigné(e), <strong>${this._esc(jury.nom)}</strong>, certifie avoir fait passer les candidats ci-dessus.</p>
            <div class="emarg-sign-jury">
              <span>Date et signature du jury :</span>
              <div class="sign-box"></div>
            </div>
          </div>
        </div>
      `;
    });

    if (!html) { notifier('Aucun créneau à émarger.', 'warning'); return; }
    this._imprimer(html);
  },

  // ──────────────────────────────────────────────────────────────
  // 5. CONSIGNES JURY
  // ──────────────────────────────────────────────────────────────

  consignesJury() {
    const p = AppData.params;
    const html = `
      <div class="print-page consignes-page">
        ${this._entete('CONSIGNES JURY', 'Épreuve orale du DNB')}

        <h3 class="consignes-titre">Déroulement de l'épreuve</h3>
        <p>L'épreuve orale du Diplôme National du Brevet évalue la capacité du candidat à présenter et défendre un exposé.</p>

        <div class="consignes-grid">
          <div class="consigne-bloc">
            <h4>⏱ Durée des passages</h4>
            <ul>
              <li>Passage <strong>solo</strong> : <strong>${p.dureeSolo} minutes</strong></li>
              <li>Passage <strong>binôme</strong> : <strong>${p.dureeBinome} minutes</strong></li>
              <li>Candidat avec <strong>aménagement tiers-temps</strong> : durée × 4/3 arrondie à 5 min</li>
            </ul>
          </div>

          <div class="consigne-bloc">
            <h4>📋 Structure de l'épreuve (solo)</h4>
            <ul>
              <li><strong>5 min</strong> — Exposé du candidat (sans interruption)</li>
              <li><strong>10 min</strong> — Entretien avec le jury</li>
              <li><strong>10 min</strong> — Questions sur le programme (LV comprise)</li>
            </ul>
          </div>

          <div class="consigne-bloc">
            <h4>✅ À vérifier à chaque passage</h4>
            <ul>
              <li>Identité du candidat (carnet ou pièce d'identité)</li>
              <li>Présence d'un document de présentation (autorisé)</li>
              <li>Langue vivante du candidat correspond à votre jury</li>
              <li>Signaler tout incident sur la feuille d'émargement</li>
            </ul>
          </div>

          <div class="consigne-bloc">
            <h4>📝 Notation</h4>
            <ul>
              <li>Note sur <strong>100 points</strong> (coefficient selon textes)</li>
              <li>Compétences évaluées : expression orale, maîtrise du sujet, réponses aux questions</li>
              <li>Remettre la grille d'évaluation complétée et signée au secrétariat</li>
            </ul>
          </div>

          <div class="consigne-bloc">
            <h4>⚠ Points de vigilance</h4>
            <ul>
              <li>Confidentialité : ne pas communiquer les notes avant la proclamation</li>
              <li>Neutralité : aucun commentaire sur la prestation devant d'autres élèves</li>
              <li>Absence d'un candidat : noter "ABS" sur la feuille d'émargement</li>
              <li>Pauses : ${(p.pauses||[]).filter(pa=>pa.active&&pa.duree>0).map(pa=>`${pa.heure} (${pa.duree} min)`).join(', ') || 'Aucune'}</li>
            </ul>
          </div>

          <div class="consigne-bloc">
            <h4>📞 En cas de problème</h4>
            <ul>
              <li>Contacter immédiatement le secrétariat ou la direction</li>
              <li>Ne pas prendre de décision individuelle concernant un candidat absent</li>
              <li>En cas de fraude : interrompre le passage et alerter la direction</li>
            </ul>
          </div>
        </div>

        <div class="consignes-footer">
          <p>Merci de votre engagement pour cet examen. La direction reste disponible tout au long de la journée.</p>
          <p><em>${this._esc(p.etablissement)} — Année scolaire ${this._esc(p.annee)}</em></p>
        </div>
      </div>
    `;
    this._imprimer(html);
  },
};

window.Print = Print;
