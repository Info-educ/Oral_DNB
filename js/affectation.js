/**
 * affectation.js — Moteur d'affectation automatique
 * Oral DNB · Collège Joliot Curie  —  Rev.3
 *
 * Contraintes :
 *   1. Langue avec priorité (rev.5) :
 *        élève Anglais  → jury Anglais en priorité, puis jurys sans langue
 *        élève Espagnol → jury Espagnol en priorité, puis jurys sans langue
 *        élève sans langue → jury sans langue d'abord, puis jurys avec langue (complétion)
 *        jury avec langue → élèves de la langue en priorité, complété par sans-langue
 *        jury sans langue → élèves sans langue uniquement
 *   2. Binômes : même jury + même créneau + dureeBinome
 *   3. Tiers-temps : durée × 4/3 arrondie au multiple de 5 min
 *   4. Prioritaires : premiers créneaux de leur jury
 *   5. Pause méridienne : aucun chevauchement
 *   6. Capacité : calculée automatiquement si jury.capacite === 0
 */

'use strict';

const Affectation = {

  // ──────────────────────────────────────────────────────────────
  // POINT D'ENTRÉE
  // ──────────────────────────────────────────────────────────────

  /**
   * Lance l'affectation complète.
   * @param {Map} confirmations - Map<eleveId, partenaireId|null> pour les binômes flous
   *   null = rejet (passe en solo), un id = partenaire confirmé
   * @returns {{
   *   ok: boolean,
   *   message: string,
   *   avertissements: string[],
   *   confirmationsRequises: Object[]   ← non vide = UI doit demander confirmation avant de relancer
   * }}
   */
  lancer(confirmations = new Map()) {
    const avert = [];

    if (AppData.nbJurys()  === 0) return { ok:false, message:'Aucun jury saisi.',  avertissements:[], confirmationsRequises:[] };
    if (AppData.nbEleves() === 0) return { ok:false, message:'Aucun élève saisi.', avertissements:[], confirmationsRequises:[] };

    this._calculerCapaciteAuto(avert);

    const { groupes, avertBinomes, confirmationsRequises } = this._resoudreBinomes(confirmations);
    avert.push(...avertBinomes);

    // S'il y a des binômes flous non encore confirmés → interrompre et demander à l'utilisateur
    if (confirmationsRequises.length > 0) {
      return {
        ok                    : false,
        message               : '',
        avertissements        : avert,
        confirmationsRequises,
      };
    }

    const groupesTries = this._trierGroupes(groupes);
    const { plannings, avertAffect } = this._affecter(groupesTries);
    avert.push(...avertAffect);

    const creneaux = this._calculerHoraires(plannings);
    AppData.affectation = creneaux;

    const nbAff    = creneaux.reduce((s,c) => s + c.eleveIds.length, 0);
    const nbNonAff = AppData.nbEleves() - nbAff;
    if (nbNonAff > 0) avert.push(`⚠ ${nbNonAff} élève(s) non affecté(s) — vérifiez la langue vivante et la capacité des jurys.`);

    return {
      ok                    : true,
      message               : `Affectation terminée : ${nbAff} élève(s) réparti(s) en ${creneaux.length} créneaux.`,
      avertissements        : avert,
      confirmationsRequises : [],
    };
  },

  // ──────────────────────────────────────────────────────────────
  // CAPACITÉ AUTOMATIQUE
  // ──────────────────────────────────────────────────────────────

  /**
   * Si un jury a capacite === 0, calcule sa capacité à partir de la plage horaire.
   * Utilise AppData.calculerNbJurys() comme référence.
   */
  _calculerCapaciteAuto(avert) {
    const calcul = AppData.calculerNbJurys();
    if (!calcul.ok) {
      avert.push(`Calcul automatique de capacité impossible : ${calcul.erreur}`);
      // Fallback : 10 élèves par jury
      AppData.jurys.forEach(j => { if (!j.capacite) j.capacite = 10; });
      return;
    }

    AppData.jurys.forEach(j => {
      if (!j.capacite || j.capacite === 0) {
        j.capacite = calcul.capaciteParJury;
      }
    });
  },

  // ──────────────────────────────────────────────────────────────
  // CORRESPONDANCE APPROXIMATIVE (fuzzy matching)
  // ──────────────────────────────────────────────────────────────

  /**
   * Normalise une chaîne pour la comparaison :
   * minuscules, sans accents, sans espaces multiples.
   */
  _norm(str) {
    return (str || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ').trim();
  },

  /**
   * Distance de Levenshtein entre deux chaînes.
   * @returns {number} nombre d'opérations (insertion, suppression, substitution)
   */
  _levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = i;
      for (let j = 1; j <= b.length; j++) {
        const val = a[i-1] === b[j-1]
          ? dp[j-1]
          : 1 + Math.min(dp[j], prev, dp[j-1]);
        dp[j-1] = prev;
        prev = val;
      }
      dp[b.length] = prev;
    }
    return dp[b.length];
  },

  /**
   * Score de similarité entre 0 et 1 (1 = identique).
   */
  _similarite(a, b) {
    const na = this._norm(a);
    const nb = this._norm(b);
    if (na === nb) return 1;
    const maxLen = Math.max(na.length, nb.length);
    if (maxLen === 0) return 1;
    return 1 - this._levenshtein(na, nb) / maxLen;
  },

  /**
   * Cherche le meilleur partenaire de binôme pour un élève parmi tous les élèves.
   * Retourne { eleve, score, exact } ou null si aucun candidat décent.
   *
   * Seuils :
   *   score ≥ 0.85  → match automatique (faute mineure : 1-2 caractères)
   *   score 0.60-0.84 → match incertain → demande de confirmation
   *   score < 0.60  → pas de match
   */
  _chercherPartenaire(eleve, indexExact) {
    const cible = this._norm(eleve.binomeAvec);

    // 1. Match exact d'abord
    const exact = indexExact.get(cible);
    if (exact) return { eleve: exact, score: 1, exact: true };

    // 2. Fuzzy : comparer avec tous les élèves
    let meilleur = null;
    let meilleurScore = 0;

    AppData.eleves.forEach(candidat => {
      if (candidat.id === eleve.id) return;
      const nomComplet = this._norm(`${candidat.nom} ${candidat.prenom}`);
      const score = this._similarite(cible, nomComplet);
      if (score > meilleurScore) {
        meilleurScore = score;
        meilleur = candidat;
      }
    });

    if (meilleurScore >= 0.85) return { eleve: meilleur, score: meilleurScore, exact: true  }; // auto
    if (meilleurScore >= 0.60) return { eleve: meilleur, score: meilleurScore, exact: false }; // confirmation
    return null; // pas de match
  },

  // ──────────────────────────────────────────────────────────────
  // PHASE 1 — BINÔMES avec fuzzy matching
  // ──────────────────────────────────────────────────────────────

  /**
   * Résout les binômes avec correspondance approximative.
   *
   * @param {Map} confirmations - Map<eleveId, partenaireId> confirmés manuellement
   *                              (vide au premier appel, peuplée après confirmation UI)
   * @returns {{
   *   groupes: Object[],
   *   avertBinomes: string[],
   *   confirmationsRequises: Object[]   ← cas flous à confirmer par l'utilisateur
   * }}
   */
  _resoudreBinomes(confirmations = new Map()) {
    const avertBinomes = [];
    const confirmationsRequises = [];
    const traites = new Set();
    const groupes = [];

    // Index exact : "NOM PRENOM" normalisé → élève
    const indexExact = new Map();
    AppData.eleves.forEach(e => {
      indexExact.set(this._norm(`${e.nom} ${e.prenom}`), e);
    });

    const creerGroupe = (e, partenaire) => {
      if (traites.has(partenaire.id)) return; // déjà groupé par l'autre sens
      const langOk = !e.langue || !partenaire.langue || e.langue === partenaire.langue;
      if (!langOk) {
        avertBinomes.push(`Binôme ${e.nom} ${e.prenom} / ${partenaire.nom} ${partenaire.prenom} : langues incompatibles (${e.langue} / ${partenaire.langue}). Passages en solo.`);
        groupes.push({ eleveIds:[e.id],          isBinome:false, langue:e.langue,         prioritaire:e.prioritaire });
        groupes.push({ eleveIds:[partenaire.id], isBinome:false, langue:partenaire.langue, prioritaire:partenaire.prioritaire });
      } else {
        groupes.push({
          eleveIds   : [e.id, partenaire.id],
          isBinome   : true,
          langue     : e.langue || partenaire.langue || '',
          prioritaire: e.prioritaire || partenaire.prioritaire,
        });
      }
      traites.add(e.id);
      traites.add(partenaire.id);
    };

    AppData.eleves.forEach(e => {
      if (traites.has(e.id)) return;

      if (!e.binomeAvec) {
        groupes.push({ eleveIds:[e.id], isBinome:false, langue:e.langue, prioritaire:e.prioritaire });
        traites.add(e.id);
        return;
      }

      // Binôme confirmé manuellement ?
      if (confirmations.has(e.id)) {
        const partenaireId = confirmations.get(e.id);
        const partenaire = AppData.getEleve(partenaireId);
        if (partenaire && !traites.has(partenaire.id)) {
          creerGroupe(e, partenaire);
        } else if (!partenaire) {
          // Rejet manuel → solo
          groupes.push({ eleveIds:[e.id], isBinome:false, langue:e.langue, prioritaire:e.prioritaire });
          traites.add(e.id);
        }
        return;
      }

      const resultat = this._chercherPartenaire(e, indexExact);

      if (!resultat) {
        // Aucun candidat → solo
        avertBinomes.push(`Binôme introuvable pour ${e.nom} ${e.prenom} → "${e.binomeAvec}". Passage en solo.`);
        groupes.push({ eleveIds:[e.id], isBinome:false, langue:e.langue, prioritaire:e.prioritaire });
        traites.add(e.id);
        return;
      }

      if (resultat.exact) {
        // Match automatique (exact ou faute mineure ≥ 0.85)
        if (!traites.has(resultat.eleve.id)) {
          const pct = Math.round(resultat.score * 100);
          if (resultat.score < 1) {
            avertBinomes.push(`Binôme approximatif (${pct}% de similarité) : "${e.binomeAvec}" → ${resultat.eleve.nom} ${resultat.eleve.prenom}`);
          }
          creerGroupe(e, resultat.eleve);
        }
      } else {
        // Match incertain (0.60–0.84) → demander confirmation
        const pct = Math.round(resultat.score * 100);
        confirmationsRequises.push({
          eleveId      : e.id,
          eleveNom     : `${e.nom} ${e.prenom}`,
          binomeSaisi  : e.binomeAvec,
          suggeréId    : resultat.eleve.id,
          suggeréNom   : `${resultat.eleve.nom} ${resultat.eleve.prenom}`,
          score        : resultat.score,
          scorePct     : pct,
        });
        // Provisoirement en solo (sera remplacé si l'utilisateur confirme)
        groupes.push({ eleveIds:[e.id], isBinome:false, langue:e.langue, prioritaire:e.prioritaire });
        traites.add(e.id);
      }
    });

    return { groupes, avertBinomes, confirmationsRequises };
  },

  // ──────────────────────────────────────────────────────────────
  // PHASE 2 — TRI
  // ──────────────────────────────────────────────────────────────

  _trierGroupes(groupes) {
    return [...groupes].sort((a,b) => {
      if (a.prioritaire !== b.prioritaire) return a.prioritaire ? -1 : 1;
      const aAm = a.eleveIds.some(id => AppData.getEleve(id)?.amenagement);
      const bAm = b.eleveIds.some(id => AppData.getEleve(id)?.amenagement);
      if (aAm !== bAm) return aAm ? -1 : 1;
      const nomA = AppData.getEleve(a.eleveIds[0])?.nom || '';
      const nomB = AppData.getEleve(b.eleveIds[0])?.nom || '';
      return nomA.localeCompare(nomB, 'fr');
    });
  },

  // ──────────────────────────────────────────────────────────────
  // PHASE 3 — AFFECTATION
  // ──────────────────────────────────────────────────────────────

  /**
   * Priorité langue pour un jury donné face à un groupe d'élèves.
   *
   * Nouvelle règle (rev.5) :
   *   - Jury AVEC langue :
   *       → Priorité 1 : élèves dont la langue correspond (ex. Anglais → Anglais)
   *       → Priorité 2 : élèves SANS langue (pour compléter si places restantes)
   *       → Interdit   : élèves d'une autre langue spécifiée (ex. Espagnol dans jury Anglais)
   *   - Jury SANS langue :
   *       → Élèves SANS langue uniquement (les élèves avec langue ont déjà leur jury)
   *
   * @returns {'exact'|'fill'|'incompatible'}
   *   'exact'        → langue élève = langue jury (passage en priorité 1)
   *   'fill'         → jury avec langue + élève sans langue (remplissage)
   *   'incompatible' → pas de place pour cet élève dans ce jury
   */
  _prioriteLangue(juryLangue, eleveLangue) {
    const jl = (juryLangue  || '').trim().toLowerCase();
    const el = (eleveLangue || '').trim().toLowerCase();

    if (jl === el) return 'exact';           // Les deux identiques (incl. les deux vides)
    if (jl !== '' && el === '') return 'fill'; // Jury avec langue, élève sans langue → remplissage
    return 'incompatible';                    // Toute autre combinaison
  },

  _affecter(groupesTries) {
    const avertAffect = [];
    const plannings = new Map();
    AppData.jurys.forEach(j => plannings.set(j.id, { jury:j, groupes:[], nbEleves:0 }));

    // Algorithme en 2 passes :
    //   Passe 1 — placer tous les élèves AVEC langue dans leurs jurys correspondants
    //   Passe 2 — placer les élèves SANS langue (jurys sans langue d'abord, puis compléter les jurys avec langue)

    const avecLangue  = groupesTries.filter(g => g.langue !== '');
    const sansLangue  = groupesTries.filter(g => g.langue === '');

    const placerGroupe = (groupe, jurysCandidats, avertir) => {
      // Parmi les candidats, prendre le moins chargé avec de la place
      const disponibles = jurysCandidats.filter(j => {
        const plan = plannings.get(j.id);
        return plan.nbEleves + groupe.eleveIds.length <= j.capacite;
      });

      if (disponibles.length === 0) {
        if (avertir) {
          const noms = groupe.eleveIds.map(id => {
            const e = AppData.getEleve(id);
            return e ? `${e.nom} ${e.prenom}` : '?';
          }).join(', ');
          const langLabel = groupe.langue ? `"${groupe.langue}"` : 'sans langue';
          avertAffect.push(`Aucun jury ${langLabel} disponible pour : ${noms}`);
        }
        return false;
      }

      disponibles.sort((a,b) => plannings.get(a.id).nbEleves - plannings.get(b.id).nbEleves);
      const jury = disponibles[0];
      const plan = plannings.get(jury.id);
      plan.groupes.push(groupe);
      plan.nbEleves += groupe.eleveIds.length;
      return true;
    };

    // ── Passe 1 : élèves avec langue → jurys de même langue ──
    avecLangue.forEach(groupe => {
      const jCompatibles = AppData.jurys.filter(j =>
        this._prioriteLangue(j.langue, groupe.langue) === 'exact'
      );
      placerGroupe(groupe, jCompatibles, true);
    });

    // ── Passe 2 : élèves sans langue ─────────────────────────
    // 2a. D'abord les jurys sans langue (correspondance exacte)
    // 2b. Ensuite les jurys avec langue qui ont encore de la place (remplissage)
    sansLangue.forEach(groupe => {
      // Essai 2a : jurys sans langue
      const jSansLangue = AppData.jurys.filter(j =>
        this._prioriteLangue(j.langue, '') === 'exact'
      );
      const place2a = placerGroupe(groupe, jSansLangue, false);
      if (place2a) return;

      // Essai 2b : jurys avec langue (remplissage)
      const jAvecLangue = AppData.jurys.filter(j =>
        this._prioriteLangue(j.langue, '') === 'fill'
      );
      const place2b = placerGroupe(groupe, jAvecLangue, false);
      if (place2b) return;

      // Aucune place nulle part
      const noms = groupe.eleveIds.map(id => {
        const e = AppData.getEleve(id);
        return e ? `${e.nom} ${e.prenom}` : '?';
      }).join(', ');
      avertAffect.push(`Aucun jury disponible pour (sans langue) : ${noms}`);
    });

    return { plannings, avertAffect };
  },

  // ──────────────────────────────────────────────────────────────
  // PHASE 4 — HORAIRES
  // ──────────────────────────────────────────────────────────────

  // Construit la liste des pauses actives triées par heure (en minutes)
  _pausesActives() {
    return (AppData.params.pauses || [])
      .filter(p => p.active && p.duree > 0)
      .map(p => ({ debut: AppData.enMinutes(p.heure), fin: AppData.enMinutes(p.heure) + parseInt(p.duree,10) }))
      .sort((a,b) => a.debut - b.debut);
  },

  // Avance le curseur au-delà de toute pause chevauchante (récursivement
  // pour le cas où une pause suit immédiatement une autre)
  _sauterPauses(curseur, duree, pauses) {
    let c = curseur;
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of pauses) {
        if (c < p.fin && (c + duree) > p.debut) {
          c = p.fin;
          changed = true;
        }
      }
    }
    return c;
  },

  _calculerHoraires(plannings) {
    const creneaux = [];
    const pauses   = this._pausesActives();
    const marge    = parseInt(AppData.params.margePassage, 10) || 0;
    const m2h      = m => `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

    plannings.forEach(({ jury, groupes }) => {
      if (!groupes.length) return;

      let curseur = AppData.enMinutes(jury.heureDebut || AppData.params.heureDebut);
      let ordre   = 1;

      groupes.forEach(groupe => {
        let duree;
        if (groupe.isBinome) {
          const am = groupe.eleveIds.some(id => AppData.getEleve(id)?.amenagement);
          duree = am ? Math.ceil((AppData.params.dureeBinome*4/3)/5)*5 : AppData.params.dureeBinome;
        } else {
          const e = AppData.getEleve(groupe.eleveIds[0]);
          duree = AppData.calculerDuree(e, false);
        }

        // Sauter toutes les pauses actives qui chevauchent ce créneau
        curseur = this._sauterPauses(curseur, duree, pauses);

        creneaux.push({
          juryId    : jury.id,
          eleveIds  : groupe.eleveIds,
          heureDebut: m2h(curseur),
          heureFin  : m2h(curseur + duree),
          duree,
          isBinome  : groupe.isBinome,
          ordre,
        });

        curseur += duree + marge;
        ordre++;
      });
    });

    return creneaux.sort((a,b) => a.juryId - b.juryId || a.ordre - b.ordre);
  },

  // ──────────────────────────────────────────────────────────────
  // MODIFICATION MANUELLE
  // ──────────────────────────────────────────────────────────────

  deplacerCreneau(creneauIdx, juryIdCible) {
    const creneau   = AppData.affectation[creneauIdx];
    if (!creneau) return 'Créneau introuvable.';
    const juryCible = AppData.getJury(juryIdCible);
    if (!juryCible) return 'Jury cible introuvable.';

    const e = AppData.getEleve(creneau.eleveIds[0]);
    if (e) {
      const prio = this._prioriteLangue(juryCible.langue, e.langue);
      if (prio === 'incompatible') {
        return `Incompatibilité de langue (élève: ${e.langue||'sans langue'} / jury: ${juryCible.langue||'sans langue'}).`;
      }
    }

    const dejaDans = AppData.affectation
      .filter(c => c.juryId === juryIdCible)
      .reduce((s,c) => s + c.eleveIds.length, 0);
    if (juryCible.capacite > 0 && dejaDans + creneau.eleveIds.length > juryCible.capacite * 1.2) {
      return `Jury "${juryCible.nom}" déjà très chargé (${dejaDans}/${juryCible.capacite}).`;
    }

    creneau.juryId = juryIdCible;
    this._recalculerTous();
    return null;
  },

  _recalculerTous() {
    const parJury    = new Map();
    AppData.jurys.forEach(j => parJury.set(j.id, []));
    AppData.affectation.forEach(c => { if (parJury.has(c.juryId)) parJury.get(c.juryId).push(c); });

    const pauses = this._pausesActives();
    const marge  = parseInt(AppData.params.margePassage, 10) || 0;
    const m2h    = m => `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

    parJury.forEach((creneaux, juryId) => {
      const jury = AppData.getJury(juryId);
      if (!jury || !creneaux.length) return;
      let curseur = AppData.enMinutes(jury.heureDebut || AppData.params.heureDebut);
      creneaux.forEach((c, i) => {
        curseur = this._sauterPauses(curseur, c.duree, pauses);
        c.heureDebut = m2h(curseur);
        c.heureFin   = m2h(curseur + c.duree);
        c.ordre      = i + 1;
        curseur     += c.duree + marge;
      });
    });
  },

  supprimerCreneau(creneauIdx) {
    AppData.affectation.splice(creneauIdx, 1);
    this._recalculerTous();
  },
};

// ── Branchement bouton principal + gestion fuzzy binômes ──

// Confirmations en attente (Map<eleveId, partenaireId|null>)
let _confirmationsBinomes = new Map();

function _lancerAvecConfirmations() {
  const res = Affectation.lancer(_confirmationsBinomes);
  _confirmationsBinomes = new Map();

  if (res.confirmationsRequises && res.confirmationsRequises.length > 0) {
    _afficherModalBinomesFlous(res.confirmationsRequises);
    return;
  }

  if (res.ok) {
    if (typeof UI !== 'undefined') {
      UI.renderAffectation();
      if (typeof Unsaved !== 'undefined') Unsaved.marquer();
    }
    _afficherModalResultat(res);
  } else if (res.message) {
    notifier(res.message, 'error', 5000);
  }
}

/**
 * Affiche la modal de résultat d'affectation avec :
 * - Résumé succès + stats
 * - Avertissements classés et actionnables
 * - Répartition par jury
 */
function _afficherModalResultat(res) {
  const modal = document.getElementById('modal-resultat-affectation');
  if (!modal) { notifier(res.message, 'success', 5000); return; }

  const nbAff    = AppData.affectation.reduce((s,c) => s + c.eleveIds.length, 0);
  const nbNonAff = AppData.nbEleves() - nbAff;
  const nbJurys  = new Set(AppData.affectation.map(c => c.juryId)).size;
  const nbCren   = AppData.affectation.length;

  // ── Résumé ──────────────────────────────────────────────
  const resumeEl = document.getElementById('resultat-resume');
  resumeEl.innerHTML = `
    <div class="resultat-resume resultat-resume-ok">
      <span class="resultat-resume-icon">✓</span>
      <div>
        <div class="resultat-resume-titre">${escHtml(res.message)}</div>
        <div class="resultat-resume-sous">Affectation effectuée — résultat modifiable dans l'onglet</div>
      </div>
    </div>`;

  // ── Stats ────────────────────────────────────────────────
  const statsEl = document.getElementById('resultat-stats');
  statsEl.style.display = '';
  statsEl.innerHTML = [
    { val: nbAff,    label: 'Élèves affectés' },
    { val: nbNonAff, label: 'Non affectés', warn: nbNonAff > 0 },
    { val: nbJurys,  label: 'Jurys utilisés' },
    { val: nbCren,   label: nbCren > 1 ? 'Créneaux' : 'Créneau' },
  ].map(s => `
    <div class="resultat-stat ${s.warn ? 'resultat-stat-warn' : ''}">
      <div class="resultat-stat-val">${s.val}</div>
      <div class="resultat-stat-label">${s.label}</div>
    </div>`).join('');

  // ── Avertissements ───────────────────────────────────────
  const avertEl     = document.getElementById('resultat-avertissements');
  const avertListe  = document.getElementById('resultat-avert-liste');
  const avertsFiltres = res.avertissements.filter(a => a);

  if (avertsFiltres.length > 0) {
    avertEl.style.display = '';
    avertListe.innerHTML = avertsFiltres.map(a => {
      // Classifier l'avertissement
      const isNonAff  = a.includes('non affecté') || a.includes('Aucun jury');
      const isBinome  = a.includes('inôme') || a.includes('approximatif');
      const isSurcharge = a.includes('surchargé') || a.includes('capacité');
      const icon = isNonAff ? '🔴' : isBinome ? '🟡' : isSurcharge ? '🟠' : '⚠';
      return `
        <div class="resultat-avert-item">
          <span class="resultat-avert-icon">${icon}</span>
          <span class="resultat-avert-text">${escHtml(a)}</span>
        </div>`;
    }).join('');
  } else {
    avertEl.style.display = 'none';
  }

  // ── Répartition par jury ─────────────────────────────────
  const repartEl = document.getElementById('resultat-repartition');
  const repartCont = document.getElementById('resultat-repartition-contenu');
  repartEl.style.display = '';

  const parJury = new Map();
  AppData.jurys.forEach(j => parJury.set(j.id, { jury:j, nb:0, langues: new Set() }));
  AppData.affectation.forEach(c => {
    const p = parJury.get(c.juryId);
    if (!p) return;
    p.nb += c.eleveIds.length;
    c.eleveIds.forEach(id => {
      const e = AppData.getEleve(id);
      if (e && e.langue) p.langues.add(e.langue);
    });
  });

  repartCont.innerHTML = `
    <div class="repartition-grille">
      ${[...parJury.values()].filter(p => p.nb > 0).map(p => {
        const pct = Math.round(p.nb / p.jury.capacite * 100);
        const cls = pct > 100 ? 'repartition-item-over' : pct > 90 ? 'repartition-item-high' : '';
        const langues = [...p.langues].join(', ') || 'sans langue';
        return `
          <div class="repartition-item ${cls}">
            <div class="repartition-jury-nom">${escHtml(p.jury.nom)}</div>
            <div class="repartition-jury-meta">Salle ${escHtml(p.jury.salle)} · ${escHtml(langues)}</div>
            <div class="repartition-barre-wrap">
              <div class="repartition-barre" style="width:${Math.min(pct,100)}%"></div>
            </div>
            <div class="repartition-chiffres">
              <strong>${p.nb}</strong> / ${p.jury.capacite} élève${p.nb > 1 ? 's' : ''}
              <span class="repartition-pct">${pct}%</span>
            </div>
          </div>`;
      }).join('')}
    </div>`;

  // Bouton "Voir l'affectation"
  const btnVoir = document.getElementById('btn-resultat-voir-affectation');
  if (btnVoir) {
    btnVoir.onclick = () => {
      if (typeof fermerModal === 'function') fermerModal('modal-resultat-affectation');
      // Naviguer vers l'onglet Affectation
      document.querySelector('[data-tab="affectation"]')?.click();
    };
  }

  if (typeof ouvrirModal === 'function') ouvrirModal('modal-resultat-affectation');
}

function _afficherModalBinomesFlous(confirmations) {
  const liste = document.getElementById('binomes-flous-liste');
  if (!liste) return;

  // Construire les cartes de confirmation
  liste.innerHTML = confirmations.map((c, i) => `
    <div class="binome-flou-card" id="bfc-${i}" data-idx="${i}"
         data-eleve-id="${c.eleveId}" data-suggere-id="${c.suggeréId}">
      <div class="bfc-header">
        <span class="bfc-badge">${c.scorePct}% de similarité</span>
      </div>
      <div class="bfc-body">
        <div class="bfc-eleve">
          <span class="bfc-label">Élève</span>
          <strong>${escHtml(c.eleveNom)}</strong>
          a saisi comme binôme :
          <em>"${escHtml(c.binomeSaisi)}"</em>
        </div>
        <div class="bfc-suggestion">
          <span class="bfc-label">Correspondance trouvée</span>
          <strong>${escHtml(c.suggeréNom)}</strong>
        </div>
      </div>
      <div class="bfc-actions">
        <button class="btn btn-outline bfc-btn-rejeter" data-idx="${i}" title="Passer en solo">
          ✕ Passer en solo
        </button>
        <button class="btn btn-primary bfc-btn-confirmer" data-idx="${i}" title="Confirmer le binôme">
          ✓ Confirmer le binôme
        </button>
      </div>
    </div>
  `).join('');

  // Stocker les confirmations en cours
  // Par défaut : tous non décidés (classe neutre)
  window._binoFlousData = confirmations;
  window._binoDecisions = confirmations.map(() => null); // null = pas encore décidé

  // Branchement boutons de chaque carte
  liste.querySelectorAll('.bfc-btn-confirmer').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx     = parseInt(btn.dataset.idx);
      const card    = document.getElementById(`bfc-${idx}`);
      const eleveId = parseInt(card.dataset.eleveId);
      const suggId  = parseInt(card.dataset.suggereId);
      window._binoDecisions[idx] = { eleveId, partenaireId: suggId };
      card.classList.add('bfc-confirmed'); card.classList.remove('bfc-rejected');
      btn.disabled = true;
      card.querySelector('.bfc-btn-rejeter').disabled = true;
    });
  });

  liste.querySelectorAll('.bfc-btn-rejeter').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx     = parseInt(btn.dataset.idx);
      const card    = document.getElementById(`bfc-${idx}`);
      const eleveId = parseInt(card.dataset.eleveId);
      window._binoDecisions[idx] = { eleveId, partenaireId: null };
      card.classList.add('bfc-rejected'); card.classList.remove('bfc-confirmed');
      btn.disabled = true;
      card.querySelector('.bfc-btn-confirmer').disabled = true;
    });
  });

  // Bouton "Tout rejeter"
  const btnToutRejeter = document.getElementById('btn-binomes-tout-rejeter');
  if (btnToutRejeter) {
    btnToutRejeter.onclick = () => {
      confirmations.forEach((c, i) => {
        window._binoDecisions[i] = { eleveId: c.eleveId, partenaireId: null };
        const card = document.getElementById(`bfc-${i}`);
        if (card) { card.classList.add('bfc-rejected'); card.classList.remove('bfc-confirmed'); }
        liste.querySelectorAll('.bfc-btn-confirmer, .bfc-btn-rejeter').forEach(b => b.disabled = true);
      });
    };
  }

  // Bouton "Valider et affecter"
  const btnValider = document.getElementById('btn-binomes-valider');
  if (btnValider) {
    btnValider.onclick = () => {
      // Vérifier que toutes les décisions sont prises
      const nonDecides = window._binoDecisions.filter(d => d === null);
      if (nonDecides.length > 0) {
        notifier(`Veuillez confirmer ou rejeter les ${nonDecides.length} binôme(s) restant(s).`, 'warning', 4000);
        return;
      }
      // Construire la Map de confirmations
      _confirmationsBinomes = new Map();
      window._binoDecisions.forEach(d => {
        if (d) _confirmationsBinomes.set(d.eleveId, d.partenaireId);
      });
      // Fermer la modal et relancer
      if (typeof fermerModal === 'function') fermerModal('modal-binomes-flous');
      _lancerAvecConfirmations();
    };
  }

  // Ouvrir la modal
  if (typeof ouvrirModal === 'function') ouvrirModal('modal-binomes-flous');
}

// Petite fonction escHtml locale pour affectation.js
function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-lancer-affectation');
  if (btn) btn.addEventListener('click', _lancerAvecConfirmations);
});

window.Affectation = Affectation;
