/**
 * affectation.js — Moteur d'affectation automatique
 * Oral DNB · Collège Joliot Curie  —  Rev.4
 *
 * Nouveautés Rev.4 :
 *   — Pauses ADAPTATIVES par jury :
 *       l'heure indiquée est "indicative" ; la pause s'insère juste après
 *       le candidat qui se termine le plus près de l'horaire cible,
 *       afin de ne jamais couper un passage en cours.
 *   — Affectation des non-affectés :
 *       bouton "Affecter les non-affectés" visible après affectation ;
 *       place les élèves restants même si la session dépasse l'heure de fin.
 *   — Déplacement par Drag & Drop :
 *       les lignes de la table affectation sont draggables ;
 *       on peut déposer un créneau sur la carte d'un autre jury.
 *
 * Contraintes maintenues :
 *   1. Langue avec priorité : élève Anglais → jury Anglais en priorité
 *   2. Binômes : même jury + même créneau + dureeBinome
 *   3. Tiers-temps : durée × 4/3 arrondie au multiple de 5 min
 *   4. Prioritaires : premiers créneaux de leur jury
 *   5. Pauses : ADAPTATIVES (voir ci-dessus)
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
   * @param {boolean} nonAffectesUniquement - si true, n'affecte que les élèves non encore affectés
   * @returns {{ ok, message, avertissements, confirmationsRequises }}
   */
  lancer(confirmations = new Map(), nonAffectesUniquement = false) {
    const avert = [];

    if (AppData.nbJurys()  === 0) return { ok:false, message:'Aucun jury saisi.',  avertissements:[], confirmationsRequises:[] };
    if (AppData.nbEleves() === 0) return { ok:false, message:'Aucun élève saisi.', avertissements:[], confirmationsRequises:[] };

    this._calculerCapaciteAuto(avert);

    // Si on n'affecte que les non-affectés, on filtre les élèves déjà en créneau
    let elevesATraiter = AppData.eleves;
    if (nonAffectesUniquement) {
      const dejaDansCreneaux = new Set(AppData.affectation.flatMap(c => c.eleveIds));
      elevesATraiter = AppData.eleves.filter(e => !dejaDansCreneaux.has(e.id));
      if (elevesATraiter.length === 0) {
        return { ok:true, message:'Tous les élèves sont déjà affectés.', avertissements:[], confirmationsRequises:[] };
      }
    }

    const { groupes, avertBinomes, confirmationsRequises } = this._resoudreBinomes(confirmations, elevesATraiter);
    avert.push(...avertBinomes);

    if (confirmationsRequises.length > 0) {
      return { ok:false, message:'', avertissements:avert, confirmationsRequises };
    }

    const groupesTries = this._trierGroupes(groupes);
    const { plannings, avertAffect } = this._affecter(groupesTries, nonAffectesUniquement);
    avert.push(...avertAffect);

    // Recalcul des horaires : si mode non-affectés, on repart des créneaux existants par jury
    const creneaux = this._calculerHoraires(plannings, nonAffectesUniquement);

    if (nonAffectesUniquement) {
      // Fusionner les nouveaux créneaux avec les existants
      AppData.affectation = [...AppData.affectation, ...creneaux];
      this._recalculerTous();
    } else {
      AppData.affectation = creneaux;
    }

    const nbAff    = AppData.affectation.reduce((s,c) => s + c.eleveIds.length, 0);
    const nbNonAff = AppData.nbEleves() - nbAff;
    if (nbNonAff > 0) avert.push(`⚠ ${nbNonAff} élève(s) non affecté(s) — vérifiez la langue vivante et la capacité des jurys.`);

    const msg = nonAffectesUniquement
      ? `${creneaux.length} créneau(x) ajouté(s) pour les élèves non affectés.`
      : `Affectation terminée : ${nbAff} élève(s) réparti(s) en ${AppData.affectation.length} créneaux.`;

    return { ok:true, message:msg, avertissements:avert, confirmationsRequises:[] };
  },

  // ──────────────────────────────────────────────────────────────
  // CAPACITÉ AUTOMATIQUE
  // ──────────────────────────────────────────────────────────────

  _calculerCapaciteAuto(avert) {
    const calcul = AppData.calculerNbJurys();
    if (!calcul.ok) {
      avert.push(`Calcul automatique de capacité impossible : ${calcul.erreur}`);
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
  // FUZZY MATCHING
  // ──────────────────────────────────────────────────────────────

  _norm(str) {
    return (str || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ').trim();
  },

  _levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = i;
      for (let j = 1; j <= b.length; j++) {
        const val = a[i-1] === b[j-1] ? dp[j-1] : 1 + Math.min(dp[j], prev, dp[j-1]);
        dp[j-1] = prev;
        prev = val;
      }
      dp[b.length] = prev;
    }
    return dp[b.length];
  },

  _similarite(a, b) {
    const na = this._norm(a), nb = this._norm(b);
    if (na === nb) return 1;
    const maxLen = Math.max(na.length, nb.length);
    if (maxLen === 0) return 1;
    return 1 - this._levenshtein(na, nb) / maxLen;
  },

  _chercherPartenaire(eleve, indexExact) {
    const cible = this._norm(eleve.binomeAvec);
    const exact = indexExact.get(cible);
    if (exact) return { eleve: exact, score: 1, exact: true };

    let meilleur = null, meilleurScore = 0;
    AppData.eleves.forEach(candidat => {
      if (candidat.id === eleve.id) return;
      const nomComplet = this._norm(`${candidat.nom} ${candidat.prenom}`);
      const score = this._similarite(cible, nomComplet);
      if (score > meilleurScore) { meilleurScore = score; meilleur = candidat; }
    });

    if (meilleurScore >= 0.85) return { eleve: meilleur, score: meilleurScore, exact: true  };
    if (meilleurScore >= 0.60) return { eleve: meilleur, score: meilleurScore, exact: false };
    return null;
  },

  // ──────────────────────────────────────────────────────────────
  // PHASE 1 — BINÔMES
  // ──────────────────────────────────────────────────────────────

  _resoudreBinomes(confirmations = new Map(), elevesATraiter = null) {
    const avertBinomes = [], confirmationsRequises = [];
    const traites = new Set();
    const groupes = [];
    const eleves = elevesATraiter || AppData.eleves;

    const indexExact = new Map();
    AppData.eleves.forEach(e => indexExact.set(this._norm(`${e.nom} ${e.prenom}`), e));

    const creerGroupe = (e, partenaire) => {
      if (traites.has(partenaire.id)) return;
      const langOk = !e.langue || !partenaire.langue || e.langue === partenaire.langue;
      if (!langOk) {
        avertBinomes.push(`Binôme ${e.nom} ${e.prenom} / ${partenaire.nom} ${partenaire.prenom} : langues incompatibles. Passages en solo.`);
        groupes.push({ eleveIds:[e.id],          isBinome:false, langue:e.langue,         prioritaire:e.prioritaire });
        groupes.push({ eleveIds:[partenaire.id], isBinome:false, langue:partenaire.langue, prioritaire:partenaire.prioritaire });
      } else {
        groupes.push({ eleveIds:[e.id, partenaire.id], isBinome:true, langue:e.langue||partenaire.langue||'', prioritaire:e.prioritaire||partenaire.prioritaire });
      }
      traites.add(e.id); traites.add(partenaire.id);
    };

    eleves.forEach(e => {
      if (traites.has(e.id)) return;
      if (!e.binomeAvec) {
        groupes.push({ eleveIds:[e.id], isBinome:false, langue:e.langue, prioritaire:e.prioritaire });
        traites.add(e.id); return;
      }
      if (confirmations.has(e.id)) {
        const partenaireId = confirmations.get(e.id);
        const partenaire = AppData.getEleve(partenaireId);
        if (partenaire && !traites.has(partenaire.id)) { creerGroupe(e, partenaire); }
        else if (!partenaire) { groupes.push({ eleveIds:[e.id], isBinome:false, langue:e.langue, prioritaire:e.prioritaire }); traites.add(e.id); }
        return;
      }
      const resultat = this._chercherPartenaire(e, indexExact);
      if (!resultat) {
        avertBinomes.push(`Binôme introuvable pour ${e.nom} ${e.prenom} → "${e.binomeAvec}". Passage en solo.`);
        groupes.push({ eleveIds:[e.id], isBinome:false, langue:e.langue, prioritaire:e.prioritaire });
        traites.add(e.id); return;
      }
      if (resultat.exact) {
        if (!traites.has(resultat.eleve.id)) {
          if (resultat.score < 1) avertBinomes.push(`Binôme approximatif (${Math.round(resultat.score*100)}%) : "${e.binomeAvec}" → ${resultat.eleve.nom} ${resultat.eleve.prenom}`);
          creerGroupe(e, resultat.eleve);
        }
      } else {
        confirmationsRequises.push({
          eleveId:e.id, eleveNom:`${e.nom} ${e.prenom}`,
          binomeSaisi:e.binomeAvec, suggeréId:resultat.eleve.id,
          suggeréNom:`${resultat.eleve.nom} ${resultat.eleve.prenom}`,
          score:resultat.score, scorePct:Math.round(resultat.score*100),
        });
        groupes.push({ eleveIds:[e.id], isBinome:false, langue:e.langue, prioritaire:e.prioritaire });
        traites.add(e.id);
      }
    });

    return { groupes, avertBinomes, confirmationsRequises };
  },

  // ──────────────────────────────────────────────────────────────
  // PHASE 2 — TRI avec mélange intra-strate
  //
  // Contraintes absolues maintenues :
  //   1. Prioritaires TOUJOURS en premier
  //   2. Aménagements (tiers-temps) juste après les prioritaires
  //   3. Dans chaque strate : mélange aléatoire (Fisher-Yates)
  //      → les classes sont entremêlées, pas de bloc 3A puis 3B puis 3D
  // ──────────────────────────────────────────────────────────────

  /** Mélange un tableau en place (Fisher-Yates). */
  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  _trierGroupes(groupes) {
    // Strate 1 : prioritaires avec amenagement
    // Strate 2 : prioritaires sans amenagement
    // Strate 3 : non-prioritaires avec amenagement
    // Strate 4 : non-prioritaires sans amenagement
    // Chaque strate est melangee aleatoirement.
    const strates = [[], [], [], []];
    groupes.forEach(g => {
      const isPrio = !!g.prioritaire;
      const isAmem = g.eleveIds.some(id => AppData.getEleve(id)?.amenagement);
      if      ( isPrio &&  isAmem) strates[0].push(g);
      else if ( isPrio && !isAmem) strates[1].push(g);
      else if (!isPrio &&  isAmem) strates[2].push(g);
      else                         strates[3].push(g);
    });
    strates.forEach(s => this._shuffle(s));
    return strates.flat();
  },

  // ──────────────────────────────────────────────────────────────
  // PHASE 3 — AFFECTATION
  // ──────────────────────────────────────────────────────────────

  _prioriteLangue(juryLangue, eleveLangue) {
    const jl = (juryLangue  || '').trim().toLowerCase();
    const el = (eleveLangue || '').trim().toLowerCase();
    if (jl === el) return 'exact';
    if (jl !== '' && el === '') return 'fill';
    return 'incompatible';
  },

  _affecter(groupesTries, sansCap = false) {
    const avertAffect = [];
    const plannings = new Map();
    AppData.jurys.forEach(j => plannings.set(j.id, { jury:j, groupes:[], nbEleves:0 }));

    const avecLangue = groupesTries.filter(g => g.langue !== '');
    const sansLangue = groupesTries.filter(g => g.langue === '');

    const placerGroupe = (groupe, jurysCandidats, avertir) => {
      // En mode non-affectés, la capacité est ignorée (sansCap=true)
      const disponibles = jurysCandidats.filter(j => {
        const plan = plannings.get(j.id);
        if (sansCap) return true;
        return plan.nbEleves + groupe.eleveIds.length <= j.capacite;
      });
      if (disponibles.length === 0) {
        if (avertir) {
          const noms = groupe.eleveIds.map(id => { const e=AppData.getEleve(id); return e?`${e.nom} ${e.prenom}`:'?'; }).join(', ');
          const langLabel = groupe.langue ? `"${groupe.langue}"` : 'sans langue';
          avertAffect.push(`Aucun jury ${langLabel} disponible pour : ${noms}`);
        }
        return false;
      }
      disponibles.sort((a,b) => plannings.get(a.id).nbEleves - plannings.get(b.id).nbEleves);
      const jury = disponibles[0];
      const plan = plannings.get(jury.id);
      plan.groupes.push(groupe); plan.nbEleves += groupe.eleveIds.length;
      return true;
    };

    // Passe 1 : élèves avec langue → jurys de même langue
    avecLangue.forEach(groupe => {
      const jCompatibles = AppData.jurys.filter(j => this._prioriteLangue(j.langue, groupe.langue) === 'exact');
      placerGroupe(groupe, jCompatibles, true);
    });

    // Passe 2 : élèves sans langue
    sansLangue.forEach(groupe => {
      const jSansLangue = AppData.jurys.filter(j => this._prioriteLangue(j.langue, '') === 'exact');
      if (placerGroupe(groupe, jSansLangue, false)) return;
      const jAvecLangue = AppData.jurys.filter(j => this._prioriteLangue(j.langue, '') === 'fill');
      if (placerGroupe(groupe, jAvecLangue, false)) return;
      const noms = groupe.eleveIds.map(id => { const e=AppData.getEleve(id); return e?`${e.nom} ${e.prenom}`:'?'; }).join(', ');
      avertAffect.push(`Aucun jury disponible pour (sans langue) : ${noms}`);
    });

    return { plannings, avertAffect };
  },

  // ──────────────────────────────────────────────────────────────
  // PHASE 4 — HORAIRES (avec pauses ADAPTATIVES)
  // ──────────────────────────────────────────────────────────────

  /**
   * Retourne les pauses actives triées, chacune avec son heure cible en minutes.
   * Contrairement à avant, la pause n'a PAS de fin fixe — elle s'insère
   * dynamiquement après le candidat qui finit le plus près de l'heure cible.
   */
  _pausesActives() {
    return (AppData.params.pauses || [])
      .filter(p => p.active && p.duree > 0)
      .map(p => ({
        cible : AppData.enMinutes(p.heure),   // heure indicative en minutes
        duree : parseInt(p.duree, 10),
      }))
      .sort((a,b) => a.cible - b.cible);
  },

  /**
   * Calcule les créneaux horaires d'un planning de jury
   * avec insertion ADAPTATIVE des pauses.
   *
   * Algorithme :
   *   Pour chaque groupe à placer :
   *     1. Vérifier si une pause non encore insérée a son heure cible ≤ curseur actuel
   *        (le candidat précédent a dépassé ou atteint l'heure de la pause)
   *        → insérer la pause MAINTENANT (après le candidat courant)
   *     2. Sinon, vérifier si commencer ce groupe ferait dépasser l'heure cible
   *        de la prochaine pause AVANT la fin du groupe
   *        → ça signifie que le candidat PRÉCÉDENT était le plus proche
   *        → insérer la pause avant ce groupe
   *
   * @param {Map} plannings
   * @param {boolean} nonAffectesUniquement - si true, on ne traite que les nouveaux groupes
   */
  _calculerHoraires(plannings, nonAffectesUniquement = false) {
    const creneaux = [];
    const pauses   = this._pausesActives();
    const marge    = parseInt(AppData.params.margePassage, 10) || 0;
    const m2h      = m => `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

    plannings.forEach(({ jury, groupes }) => {
      if (!groupes.length) return;

      let curseur = AppData.enMinutes(jury.heureDebut || AppData.params.heureDebut);

      // Si mode non-affectés, on repart de la fin du dernier créneau existant pour ce jury
      if (nonAffectesUniquement) {
        const existants = AppData.affectation.filter(c => c.juryId === jury.id);
        if (existants.length > 0) {
          const dernierFin = existants.reduce((maxFin, c) => {
            const finMin = AppData.enMinutes(c.heureFin);
            return finMin > maxFin ? finMin : maxFin;
          }, 0);
          curseur = dernierFin + marge;
        }
      }

      let ordre = nonAffectesUniquement
        ? (AppData.affectation.filter(c => c.juryId === jury.id).length + 1)
        : 1;

      // Pauses non encore insérées pour CE jury
      // (chaque jury gère ses pauses indépendamment)
      const pausesRestantes = pauses.map((p, i) => ({ ...p, idx: i, insere: false }));

      groupes.forEach((groupe, gIdx) => {
        // Calcul de la durée de ce créneau
        let duree;
        if (groupe.isBinome) {
          const am = groupe.eleveIds.some(id => AppData.getEleve(id)?.amenagement);
          duree = am ? Math.ceil((AppData.params.dureeBinome*4/3)/5)*5 : AppData.params.dureeBinome;
        } else {
          const e = AppData.getEleve(groupe.eleveIds[0]);
          duree = AppData.calculerDuree(e, false);
        }

        // ── Gestion ADAPTATIVE des pauses ──────────────────────────
        // Vérifier pour chaque pause non insérée si elle doit s'insérer AVANT ce groupe
        for (const pause of pausesRestantes) {
          if (pause.insere) continue;

          // Cas 1 : le curseur a déjà dépassé l'heure cible de la pause
          // (le candidat précédent finissait après l'heure cible → on insère maintenant)
          if (gIdx > 0 && curseur >= pause.cible) {
            curseur += pause.duree;
            pause.insere = true;
            continue;
          }

          // Cas 2 : ce groupe DÉPASSERAIT l'heure cible en cours de route
          // → la pause s'insère AVANT ce groupe (on attendait le fin du précédent)
          // Vérifier si le curseur est avant la cible et que ce groupe passerait par-dessus
          if (curseur < pause.cible && (curseur + duree) > pause.cible) {
            // Le candidat courant dépasserait l'heure de pause :
            // la pause s'insère AVANT ce groupe (le candidat précédent était le plus proche)
            curseur += pause.duree;
            pause.insere = true;
            continue;
          }
        }

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

  /**
   * Déplace un créneau par son ID vers un autre jury et une nouvelle position.
   * Utilisé par le drag & drop.
   * @param {number} creneauIdx - index dans AppData.affectation
   * @param {number} juryIdCible - id du jury de destination
   * @param {number|null} avantCreneauIdx - insérer avant ce créneau (null = en fin)
   */
  deplacerCreneauDnD(creneauIdx, juryIdCible, avantCreneauIdx = null) {
    const creneau = AppData.affectation[creneauIdx];
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

    // Retirer le créneau de sa position actuelle
    AppData.affectation.splice(creneauIdx, 1);

    // Mettre à jour le juryId
    creneau.juryId = juryIdCible;

    // Déterminer la position d'insertion
    if (avantCreneauIdx !== null) {
      // L'index a pu changer si le créneau était avant la cible
      const realIdx = avantCreneauIdx > creneauIdx ? avantCreneauIdx - 1 : avantCreneauIdx;
      AppData.affectation.splice(realIdx, 0, creneau);
    } else {
      // Insérer en fin de la liste du jury cible
      const dernier = [...AppData.affectation].reverse().findIndex(c => c.juryId === juryIdCible);
      if (dernier >= 0) {
        AppData.affectation.splice(AppData.affectation.length - dernier, 0, creneau);
      } else {
        AppData.affectation.push(creneau);
      }
    }

    this._recalculerTous();
    return null;
  },

  _recalculerTous() {
    const parJury = new Map();
    AppData.jurys.forEach(j => parJury.set(j.id, []));
    AppData.affectation.forEach(c => { if (parJury.has(c.juryId)) parJury.get(c.juryId).push(c); });

    const pauses = this._pausesActives();
    const marge  = parseInt(AppData.params.margePassage, 10) || 0;
    const m2h    = m => `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

    parJury.forEach((creneaux, juryId) => {
      const jury = AppData.getJury(juryId);
      if (!jury || !creneaux.length) return;

      let curseur = AppData.enMinutes(jury.heureDebut || AppData.params.heureDebut);
      const pausesRestantes = pauses.map(p => ({ ...p, insere: false }));

      creneaux.forEach((c, i) => {
        // Pauses adaptatives
        for (const pause of pausesRestantes) {
          if (pause.insere) continue;
          if (i > 0 && curseur >= pause.cible) { curseur += pause.duree; pause.insere = true; continue; }
          if (curseur < pause.cible && (curseur + c.duree) > pause.cible) { curseur += pause.duree; pause.insere = true; continue; }
        }
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

// ── Confirmations en attente ──────────────────────────────────────────────────
let _confirmationsBinomes = new Map();

function _lancerAvecConfirmations(nonAffectesUniquement = false) {
  const res = Affectation.lancer(_confirmationsBinomes, nonAffectesUniquement);
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

// ── Modal résultat ────────────────────────────────────────────────────────────

function _afficherModalResultat(res) {
  const modal = document.getElementById('modal-resultat-affectation');
  if (!modal) { notifier(res.message, 'success', 5000); return; }

  const nbAff    = AppData.affectation.reduce((s,c) => s + c.eleveIds.length, 0);
  const nbNonAff = AppData.nbEleves() - nbAff;
  const nbJurys  = new Set(AppData.affectation.map(c => c.juryId)).size;
  const nbCren   = AppData.affectation.length;

  const resumeEl = document.getElementById('resultat-resume');
  resumeEl.innerHTML = `
    <div class="resultat-resume resultat-resume-ok">
      <span class="resultat-resume-icon">✓</span>
      <div>
        <div class="resultat-resume-titre">${escHtml(res.message)}</div>
        <div class="resultat-resume-sous">Affectation effectuée — résultat modifiable dans l'onglet</div>
      </div>
    </div>`;

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

  const avertEl    = document.getElementById('resultat-avertissements');
  const avertListe = document.getElementById('resultat-avert-liste');
  const avertsFiltres = res.avertissements.filter(a => a);
  if (avertsFiltres.length > 0) {
    avertEl.style.display = '';
    avertListe.innerHTML = avertsFiltres.map(a => {
      const isNonAff = a.includes('non affecté') || a.includes('Aucun jury');
      const isBinome = a.includes('inôme') || a.includes('approximatif');
      const icon = isNonAff ? '🔴' : isBinome ? '🟡' : '⚠';
      return `<div class="resultat-avert-item"><span class="resultat-avert-icon">${icon}</span><span class="resultat-avert-text">${escHtml(a)}</span></div>`;
    }).join('');
  } else { avertEl.style.display = 'none'; }

  const repartEl   = document.getElementById('resultat-repartition');
  const repartCont = document.getElementById('resultat-repartition-contenu');
  repartEl.style.display = '';
  const parJury = new Map();
  AppData.jurys.forEach(j => parJury.set(j.id, { jury:j, nb:0, langues:new Set() }));
  AppData.affectation.forEach(c => {
    const p = parJury.get(c.juryId); if (!p) return;
    p.nb += c.eleveIds.length;
    c.eleveIds.forEach(id => { const e=AppData.getEleve(id); if(e&&e.langue) p.langues.add(e.langue); });
  });
  repartCont.innerHTML = `
    <div class="repartition-grille">
      ${[...parJury.values()].filter(p=>p.nb>0).map(p => {
        const pct = Math.round(p.nb / p.jury.capacite * 100);
        const cls = pct > 100 ? 'repartition-item-over' : pct > 90 ? 'repartition-item-high' : '';
        const langues = [...p.langues].join(', ') || 'sans langue';
        return `<div class="repartition-item ${cls}">
          <div class="repartition-jury-nom">${escHtml(p.jury.nom)}</div>
          <div class="repartition-jury-meta">Salle ${escHtml(p.jury.salle)} · ${escHtml(langues)}</div>
          <div class="repartition-barre-wrap"><div class="repartition-barre" style="width:${Math.min(pct,100)}%"></div></div>
          <div class="repartition-chiffres"><strong>${p.nb}</strong> / ${p.jury.capacite} élève${p.nb>1?'s':''}<span class="repartition-pct">${pct}%</span></div>
        </div>`;
      }).join('')}
    </div>`;

  const btnVoir = document.getElementById('btn-resultat-voir-affectation');
  if (btnVoir) {
    btnVoir.onclick = () => {
      if (typeof fermerModal === 'function') fermerModal('modal-resultat-affectation');
      document.querySelector('[data-tab="affectation"]')?.click();
    };
  }

  if (typeof ouvrirModal === 'function') ouvrirModal('modal-resultat-affectation');
}

// ── Modal binômes flous ───────────────────────────────────────────────────────

function _afficherModalBinomesFlous(confirmations) {
  const liste = document.getElementById('binomes-flous-liste');
  if (!liste) return;

  liste.innerHTML = confirmations.map((c, i) => `
    <div class="binome-flou-card" id="bfc-${i}" data-idx="${i}"
         data-eleve-id="${c.eleveId}" data-suggere-id="${c.suggeréId}">
      <div class="bfc-header"><span class="bfc-badge">${c.scorePct}% de similarité</span></div>
      <div class="bfc-body">
        <div class="bfc-eleve">
          <span class="bfc-label">Élève</span>
          <strong>${escHtml(c.eleveNom)}</strong> a saisi comme binôme : <em>"${escHtml(c.binomeSaisi)}"</em>
        </div>
        <div class="bfc-suggestion">
          <span class="bfc-label">Correspondance trouvée</span>
          <strong>${escHtml(c.suggeréNom)}</strong>
        </div>
      </div>
      <div class="bfc-actions">
        <button class="btn btn-outline bfc-btn-rejeter"  data-idx="${i}">✕ Passer en solo</button>
        <button class="btn btn-primary bfc-btn-confirmer" data-idx="${i}">✓ Confirmer le binôme</button>
      </div>
    </div>`).join('');

  window._binoFlousData  = confirmations;
  window._binoDecisions  = confirmations.map(() => null);

  liste.querySelectorAll('.bfc-btn-confirmer').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const card = document.getElementById(`bfc-${idx}`);
      window._binoDecisions[idx] = { eleveId:parseInt(card.dataset.eleveId), partenaireId:parseInt(card.dataset.suggereId) };
      card.classList.add('bfc-confirmed'); card.classList.remove('bfc-rejected');
      btn.disabled = true; card.querySelector('.bfc-btn-rejeter').disabled = true;
    });
  });

  liste.querySelectorAll('.bfc-btn-rejeter').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const card = document.getElementById(`bfc-${idx}`);
      window._binoDecisions[idx] = { eleveId:parseInt(card.dataset.eleveId), partenaireId:null };
      card.classList.add('bfc-rejected'); card.classList.remove('bfc-confirmed');
      btn.disabled = true; card.querySelector('.bfc-btn-confirmer').disabled = true;
    });
  });

  const btnToutRejeter = document.getElementById('btn-binomes-tout-rejeter');
  if (btnToutRejeter) {
    btnToutRejeter.onclick = () => {
      confirmations.forEach((c, i) => {
        window._binoDecisions[i] = { eleveId:c.eleveId, partenaireId:null };
        const card = document.getElementById(`bfc-${i}`);
        if (card) { card.classList.add('bfc-rejected'); card.classList.remove('bfc-confirmed'); }
        liste.querySelectorAll('.bfc-btn-confirmer, .bfc-btn-rejeter').forEach(b => b.disabled = true);
      });
    };
  }

  const btnValider = document.getElementById('btn-binomes-valider');
  if (btnValider) {
    btnValider.onclick = () => {
      const nonDecides = window._binoDecisions.filter(d => d === null);
      if (nonDecides.length > 0) { notifier(`Veuillez traiter les ${nonDecides.length} binôme(s) restant(s).`, 'warning', 4000); return; }
      _confirmationsBinomes = new Map();
      window._binoDecisions.forEach(d => { if (d) _confirmationsBinomes.set(d.eleveId, d.partenaireId); });
      if (typeof fermerModal === 'function') fermerModal('modal-binomes-flous');
      _lancerAvecConfirmations();
    };
  }

  if (typeof ouvrirModal === 'function') ouvrirModal('modal-binomes-flous');
}

// Helper escHtml local
function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-lancer-affectation');
  if (btn) btn.addEventListener('click', () => _lancerAvecConfirmations(false));

  // Bouton "Affecter les non-affectés" (ajouté dynamiquement par ui.js)
  document.addEventListener('click', e => {
    if (e.target.closest('#btn-affecter-non-affectes')) {
      _lancerAvecConfirmations(true);
    }
  });
});

window.Affectation = Affectation;
window._lancerAvecConfirmations = _lancerAvecConfirmations;
