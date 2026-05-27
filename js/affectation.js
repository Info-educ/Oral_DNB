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

  lancer() {
    const avert = [];

    if (AppData.nbJurys()  === 0) return { ok:false, message:'Aucun jury saisi.', avertissements:[] };
    if (AppData.nbEleves() === 0) return { ok:false, message:'Aucun élève saisi.', avertissements:[] };

    // Calculer la capacité automatique si non définie
    this._calculerCapaciteAuto(avert);

    const { groupes, avertBinomes } = this._resoudreBinomes();
    avert.push(...avertBinomes);

    const groupesTries = this._trierGroupes(groupes);

    const { plannings, avertAffect } = this._affecter(groupesTries);
    avert.push(...avertAffect);

    const creneaux = this._calculerHoraires(plannings);
    AppData.affectation = creneaux;

    const nbAff   = creneaux.reduce((s,c) => s + c.eleveIds.length, 0);
    const nbNonAff = AppData.nbEleves() - nbAff;
    if (nbNonAff > 0) avert.push(`⚠ ${nbNonAff} élève(s) non affecté(s) — vérifiez la langue vivante et la capacité des jurys.`);

    return {
      ok             : true,
      message        : `Affectation terminée : ${nbAff} élève(s) réparti(s) en ${creneaux.length} créneaux.`,
      avertissements : avert,
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
  // PHASE 1 — BINÔMES
  // ──────────────────────────────────────────────────────────────

  _resoudreBinomes() {
    const avertBinomes = [];
    const traites = new Set();
    const groupes = [];

    const norm = str => (str||'').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ').trim();

    const index = new Map();
    AppData.eleves.forEach(e => {
      index.set(norm(`${e.nom} ${e.prenom}`), e);
    });

    AppData.eleves.forEach(e => {
      if (traites.has(e.id)) return;

      if (e.binomeAvec) {
        const partenaire = index.get(norm(e.binomeAvec));

        if (!partenaire) {
          avertBinomes.push(`Binôme introuvable pour ${e.nom} ${e.prenom} → "${e.binomeAvec}". Passage en solo.`);
          groupes.push({ eleveIds:[e.id], isBinome:false, langue:e.langue, prioritaire:e.prioritaire });
          traites.add(e.id);
          return;
        }

        if (traites.has(partenaire.id)) return;

        // Langues compatibles ? (vide = indifférent, sinon doit correspondre)
        const langOk = !e.langue || !partenaire.langue || e.langue === partenaire.langue;
        if (!langOk) {
          avertBinomes.push(`Binôme ${e.nom}/${partenaire.nom} : langues incompatibles. Passages en solo.`);
          groupes.push({ eleveIds:[e.id],          isBinome:false, langue:e.langue,         prioritaire:e.prioritaire });
          groupes.push({ eleveIds:[partenaire.id], isBinome:false, langue:partenaire.langue, prioritaire:partenaire.prioritaire });
          traites.add(e.id);
          traites.add(partenaire.id);
          return;
        }

        const langueGroupe = e.langue || partenaire.langue || '';
        groupes.push({
          eleveIds   : [e.id, partenaire.id],
          isBinome   : true,
          langue     : langueGroupe,
          prioritaire: e.prioritaire || partenaire.prioritaire,
        });
        traites.add(e.id);
        traites.add(partenaire.id);

      } else {
        groupes.push({ eleveIds:[e.id], isBinome:false, langue:e.langue, prioritaire:e.prioritaire });
        traites.add(e.id);
      }
    });

    return { groupes, avertBinomes };
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

// Branchement bouton
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-lancer-affectation');
  if (btn) {
    btn.addEventListener('click', () => {
      const res = Affectation.lancer();
      if (typeof notifier === 'function') {
        notifier(res.message, res.ok ? 'success' : 'error', 5000);
        res.avertissements.forEach(a => notifier(a, 'warning', 8000));
      }
      if (res.ok && typeof UI !== 'undefined') UI.renderAffectation();
    });
  }
});

window.Affectation = Affectation;
