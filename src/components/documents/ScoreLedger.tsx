import { useState } from 'react'
import type { ScoreEvent, ScoreSource } from '@/types'
import { clearanceLabel } from '@/utils/clearance'
import { formatDelta, formatPct } from '@/utils/trust'

export const sourceLabels: Record<ScoreSource, string> = {
  initial: 'Création',
  expert: 'Validation',
  usage: 'Utilisation',
  freshness: 'Fraîcheur',
  consistency: 'Concordance',
  contradiction: 'Contradiction',
  manual: 'Manuel',
}

const PAGE = 25

function actorLabel(e: ScoreEvent) {
  if (e.actorRole === 'admin') return 'Admin'
  if (e.actorClearance === null) return 'Système'
  return `${clearanceLabel(e.actorClearance)} · ${e.actorClearance}`
}

function toCsv(events: ScoreEvent[]) {
  const cols: [string, (e: ScoreEvent) => string | number | null | undefined][] = [
    ['date', (e) => e.at],
    ['source', (e) => e.source],
    ['score_avant', (e) => e.previousScore],
    ['score_apres', (e) => e.score],
    ['variation', (e) => e.delta],
    ['variation_pct', (e) => e.deltaPct],
    ['acteur_role', (e) => e.actorRole],
    ['acteur_accreditation', (e) => e.actorClearance],
    ['visibilite_avant', (e) => e.visibilityBefore],
    ['visibilite_apres', (e) => e.visibilityAfter],
    ['volatilite', (e) => e.volatility],
    ['validations', (e) => e.signals?.expertValidations],
    ['utilisations', (e) => e.signals?.successfulUses],
    ['consultations', (e) => e.signals?.views],
    ['confirmations', (e) => e.signals?.confirmations],
    ['contradictions', (e) => e.signals?.contradictions],
    ['raison', (e) => e.reason],
  ]
  const cell = (v: unknown) => (v === null || v === undefined ? '' : /[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
  return [cols.map(([name]) => name).join(';'), ...events.map((e) => cols.map(([, get]) => cell(get(e))).join(';'))].join('\n')
}

/** Journal des mouvements du Trust Score, du plus récent au plus ancien */
export default function ScoreLedger({ events, fileName }: { events: ScoreEvent[]; fileName: string }) {
  const [source, setSource] = useState<ScoreSource | ''>('')
  const [shown, setShown] = useState(PAGE)

  const sources = [...new Set(events.map((e) => e.source))]
  const rows = events.filter((e) => !source || e.source === source)

  const exportCsv = () => {
    // BOM pour qu'Excel lise l'UTF-8 (accents)
    const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, download: `${fileName.replace(/\.[^.]+$/, '')}-historique-confiance.csv` }).click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="ledger">
      <div className="ledger__toolbar">
        <select
          className="input"
          aria-label="Filtrer par source"
          value={source}
          onChange={(e) => (setSource(e.target.value as ScoreSource | ''), setShown(PAGE))}
        >
          <option value="">Toutes les sources ({events.length})</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {sourceLabels[s]} ({events.filter((e) => e.source === s).length})
            </option>
          ))}
        </select>
        <button type="button" className="btn btn--secondary btn--small" onClick={exportCsv}>
          Exporter en CSV
        </button>
      </div>

      <div className="table-wrap">
        <table className="table ledger__table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Source</th>
              <th scope="col" className="num">Avant</th>
              <th scope="col" className="num">Après</th>
              <th scope="col" className="num">Variation</th>
              <th scope="col" className="num">%</th>
              <th scope="col">Acteur</th>
              <th scope="col">Visible dès</th>
              <th scope="col" className="num">Volatilité</th>
              <th scope="col">Raison</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((e) => {
              const dir = e.delta > 0 ? 'up' : e.delta < 0 ? 'down' : 'flat'
              return (
                <tr key={e.id}>
                  <td className="mono">
                    {new Date(e.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td>
                    <span className={`source source--${e.source}`}>{sourceLabels[e.source]}</span>
                  </td>
                  <td className="num mono">{e.previousScore}</td>
                  <td className="num mono">
                    <strong>{e.score}</strong>
                  </td>
                  <td className={`num mono tv__${dir}`}>
                    {dir === 'up' ? '▲' : dir === 'down' ? '▼' : '·'} {formatDelta(e.delta)}
                  </td>
                  <td className={`num mono tv__${dir}`}>{formatPct(e.deltaPct)}</td>
                  <td>{actorLabel(e)}</td>
                  <td className="mono">
                    {e.visibilityBefore === e.visibilityAfter
                      ? `niv. ${e.visibilityAfter}`
                      : `niv. ${e.visibilityBefore} → ${e.visibilityAfter}`}
                  </td>
                  <td className="num mono">{e.volatility ?? '—'}</td>
                  <td className="ledger__reason">{e.reason}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {rows.length > shown && (
        <button type="button" className="link-button" onClick={() => setShown((n) => n + PAGE)}>
          Afficher {Math.min(PAGE, rows.length - shown)} mouvements de plus ({rows.length - shown} restants)
        </button>
      )}
    </div>
  )
}
