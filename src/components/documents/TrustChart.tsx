import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { ScoreEvent } from '@/types'
import { deltaPctOf, formatDelta, formatPct } from '@/utils/trust'

type Interval = 'event' | 'day' | 'week'
type Range = '7d' | '1m' | '3m' | 'all'

const INTERVALS: { key: Interval; label: string }[] = [
  { key: 'event', label: 'Mouvement' },
  { key: 'day', label: 'Jour' },
  { key: 'week', label: 'Semaine' },
]
const RANGES: { key: Range; label: string; days: number | null }[] = [
  { key: '7d', label: '7J', days: 7 },
  { key: '1m', label: '1M', days: 30 },
  { key: '3m', label: '3M', days: 91 },
  { key: 'all', label: 'Tout', days: null },
]

/** Bougie OHLC : ouverture = score avant le premier mouvement de la période, clôture = score après le dernier */
interface Candle {
  key: string
  start: Date
  open: number
  high: number
  low: number
  close: number
  /** Nombre de mouvements dans la période */
  volume: number
  ups: number
  downs: number
}

function bucketStart(date: Date, interval: Interval) {
  const d = new Date(date)
  if (interval === 'event') return d
  d.setHours(0, 0, 0, 0)
  if (interval === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

/** events : ordre chronologique */
function toCandles(events: ScoreEvent[], interval: Interval): Candle[] {
  const candles: Candle[] = []
  for (const e of events) {
    const start = bucketStart(new Date(e.at), interval)
    const key = interval === 'event' ? e.id : start.toISOString()
    const last = candles.at(-1)
    if (last?.key === key) {
      last.close = e.score
      last.high = Math.max(last.high, e.score, e.previousScore)
      last.low = Math.min(last.low, e.score, e.previousScore)
      last.volume++
    } else {
      candles.push({
        key,
        start,
        open: e.previousScore,
        close: e.score,
        high: Math.max(e.score, e.previousScore),
        low: Math.min(e.score, e.previousScore),
        volume: 1,
        ups: 0,
        downs: 0,
      })
    }
    const c = candles.at(-1)!
    if (e.delta > 0) c.ups++
    if (e.delta < 0) c.downs++
  }
  return candles
}

function niceStep(span: number) {
  return [1, 2, 5, 10, 20, 25, 50].find((s) => span / s <= 5) ?? 50
}

const direction = (c: Pick<Candle, 'open' | 'close'>) => (c.close > c.open ? 'up' : c.close < c.open ? 'down' : 'flat')

const formatDate = (d: Date, interval: Interval) =>
  interval === 'event'
    ? d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : interval === 'week'
      ? `Semaine du ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
      : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })

// Géométrie en pixels ; la largeur suit le conteneur pour garder un texte lisible sur mobile
const TOP = 8
const PRICE_H = 240
const GAP = 12
const VOL_H = 56
const AXIS_H = 24
const LEFT = 8
const RIGHT = 48
const H = TOP + PRICE_H + GAP + VOL_H + AXIS_H

interface Props {
  /** Journal des mouvements, du plus récent au plus ancien (comme getScoreHistory) */
  events: ScoreEvent[]
  /** Score minimum visible par le lecteur : tracé comme seuil */
  readerFloor: number
}

/** Graphique de cotation du Trust Score : bougies, volume de mouvements, seuil de visibilité du lecteur */
export default function TrustChart({ events, readerFloor }: Props) {
  const [interval, setIntervalKey] = useState<Interval>('day')
  const [range, setRange] = useState<Range>('all')
  const [active, setActive] = useState<number | null>(null)
  const [W, setW] = useState(800)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!box.current) return
    const observer = new ResizeObserver(([entry]) => setW(Math.max(280, Math.round(entry.contentRect.width))))
    observer.observe(box.current)
    return () => observer.disconnect()
  }, [])

  const chronological = useMemo(() => [...events].reverse(), [events])
  const inRange = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)!.days
    if (days === null) return chronological
    const since = Date.now() - days * 86400e3
    return chronological.filter((e) => new Date(e.at).getTime() >= since)
  }, [chronological, range])
  const candles = useMemo(() => toCandles(inRange, interval), [inRange, interval])

  if (events.length === 0)
    return (
      <div className="tv" ref={box}>
        <p className="muted">Aucun mouvement enregistré.</p>
      </div>
    )

  // Résumé de la période affichée
  const first = inRange[0]
  const last = inRange.at(-1)
  const periodOpen = first?.previousScore ?? chronological.at(-1)!.score
  const periodClose = last?.score ?? periodOpen
  const periodDelta = periodClose - periodOpen
  const high = candles.length ? Math.max(...candles.map((c) => c.high)) : periodClose
  const low = candles.length ? Math.min(...candles.map((c) => c.low)) : periodClose
  const ups = inRange.filter((e) => e.delta > 0).length
  const downs = inRange.filter((e) => e.delta < 0).length

  // Échelle verticale ajustée aux données, comme une échelle de prix automatique
  const pad = Math.max(3, (high - low) * 0.12)
  let lo = Math.max(0, low - pad)
  let hi = Math.min(100, high + pad)
  if (hi - lo < 10) {
    const mid = (hi + lo) / 2
    lo = Math.max(0, mid - 5)
    hi = Math.min(100, lo + 10)
  }
  const step = niceStep(hi - lo)
  const ticks: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v)

  const PLOT_W = W - LEFT - RIGHT
  const y = (v: number) => TOP + ((hi - v) / (hi - lo)) * PRICE_H
  const slot = PLOT_W / Math.max(candles.length, 1)
  const cx = (i: number) => LEFT + slot * (i + 0.5)
  const bodyW = Math.max(1.5, Math.min(16, slot * 0.64))
  const maxVolume = Math.max(1, ...candles.map((c) => c.volume))
  const volTop = TOP + PRICE_H + GAP
  const labelEvery = Math.max(1, Math.ceil(candles.length / Math.max(2, Math.floor(W / 130))))

  const shown = active !== null ? candles[active] : candles.at(-1)
  const lastCandle = candles.at(-1)

  const pick = (e: MouseEvent<SVGSVGElement>) => {
    if (!candles.length) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    setActive(Math.min(candles.length - 1, Math.max(0, Math.floor((x - LEFT) / slot))))
  }

  const onKey = (e: KeyboardEvent) => {
    if (!candles.length || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    const current = active ?? candles.length - 1
    setActive(Math.min(candles.length - 1, Math.max(0, current + (e.key === 'ArrowRight' ? 1 : -1))))
  }

  return (
    <div className="tv" ref={box}>
      <div className="tv__toolbar">
        <div className="segmented" role="group" aria-label="Période">
          {RANGES.map((r) => (
            <button key={r.key} type="button" aria-pressed={range === r.key} onClick={() => (setRange(r.key), setActive(null))}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Intervalle des bougies">
          {INTERVALS.map((i) => (
            <button
              key={i.key}
              type="button"
              aria-pressed={interval === i.key}
              onClick={() => (setIntervalKey(i.key), setActive(null))}
            >
              {i.label}
            </button>
          ))}
        </div>
      </div>

      <dl className="tv__summary">
        <div>
          <dt>Variation</dt>
          <dd className={`tv__${direction({ open: periodOpen, close: periodClose })}`}>
            {formatDelta(periodDelta)} <span>{formatPct(deltaPctOf(periodOpen, periodDelta))}</span>
          </dd>
        </div>
        <div>
          <dt>Plus haut</dt>
          <dd>{high}</dd>
        </div>
        <div>
          <dt>Plus bas</dt>
          <dd>{low}</dd>
        </div>
        <div>
          <dt>Mouvements</dt>
          <dd>
            {inRange.length} <span>▲ {ups} · ▼ {downs}</span>
          </dd>
        </div>
      </dl>

      {candles.length === 0 ? (
        <p className="empty">Aucun mouvement sur cette période. Le score est resté à {periodClose}.</p>
      ) : (
        <div className="tv__chart">
          {shown && (
            <p className="tv__legend mono" aria-live="polite">
              <span>{formatDate(shown.start, interval)}</span>
              <span>
                Ouv. <b>{shown.open}</b> Haut <b>{shown.high}</b> Bas <b>{shown.low}</b> Clôt. <b>{shown.close}</b>
              </span>
              <span className={`tv__${direction(shown)}`}>
                {formatDelta(shown.close - shown.open)} ({formatPct(deltaPctOf(shown.open, shown.close - shown.open))})
              </span>
              <span>
                Vol. {shown.volume} (▲ {shown.ups} · ▼ {shown.downs})
              </span>
            </p>
          )}
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Cotation du score de confiance : de ${periodOpen} à ${periodClose} sur la période, ${inRange.length} mouvements. Détail dans le journal ci-dessous.`}
            tabIndex={0}
            onMouseMove={pick}
            onMouseLeave={() => setActive(null)}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
          >
            {ticks.map((v) => (
              <g key={v} className="tv__grid">
                <line x1={LEFT} x2={W - RIGHT} y1={y(v)} y2={y(v)} />
                <text x={W - RIGHT + 8} y={y(v)} dy="0.32em">
                  {v}
                </text>
              </g>
            ))}

            {readerFloor > lo && readerFloor < hi && (
              <g className="tv__floor">
                <line x1={LEFT} x2={W - RIGHT} y1={y(readerFloor)} y2={y(readerFloor)} />
                <text x={LEFT + 4} y={y(readerFloor) - 6}>
                  Votre seuil de visibilité · {readerFloor}
                </text>
              </g>
            )}

            {active !== null && <line className="tv__cursor" x1={cx(active)} x2={cx(active)} y1={TOP} y2={volTop + VOL_H} />}

            {candles.map((c, i) => {
              const dir = direction(c)
              const top = y(Math.max(c.open, c.close))
              const bodyH = Math.max(1.5, Math.abs(y(c.open) - y(c.close)))
              const volH = (c.volume / maxVolume) * VOL_H
              return (
                <g key={c.key} className={`tv__candle tv__candle--${dir} ${active === i ? 'is-active' : ''}`}>
                  <line className="tv__wick" x1={cx(i)} x2={cx(i)} y1={y(c.high)} y2={y(c.low)} />
                  <rect className="tv__body" x={cx(i) - bodyW / 2} y={top} width={bodyW} height={bodyH} rx={1} />
                  <rect className="tv__vol" x={cx(i) - bodyW / 2} y={volTop + VOL_H - volH} width={bodyW} height={volH} rx={1} />
                </g>
              )
            })}

            {lastCandle && (
              <g className={`tv__price tv__price--${direction(lastCandle)}`}>
                <line x1={LEFT} x2={W - RIGHT} y1={y(lastCandle.close)} y2={y(lastCandle.close)} />
                <rect x={W - RIGHT + 2} y={y(lastCandle.close) - 9} width={RIGHT - 4} height={18} rx={3} />
                <text x={W - RIGHT + RIGHT / 2} y={y(lastCandle.close)} dy="0.34em" textAnchor="middle">
                  {lastCandle.close}
                </text>
              </g>
            )}

            <line className="tv__sep" x1={LEFT} x2={W - RIGHT} y1={volTop - GAP / 2} y2={volTop - GAP / 2} />
            <text className="tv__pane-label" x={LEFT + 4} y={volTop + 10}>
              Volume de mouvements
            </text>
            {candles.map(
              (c, i) =>
                i % labelEvery === 0 && (
                  <text key={c.key} className="tv__xlabel" x={cx(i)} y={H - 6} textAnchor="middle">
                    {c.start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </text>
                ),
            )}
          </svg>
          <p className="tv__legend-keys muted">
            <span className="tv__key tv__key--up" /> Hausse (bougie creuse) <span className="tv__key tv__key--down" /> Baisse
            (bougie pleine) <span className="tv__key tv__key--floor" /> Votre seuil : en dessous, le document vous serait
            masqué
          </p>
        </div>
      )}
    </div>
  )
}
