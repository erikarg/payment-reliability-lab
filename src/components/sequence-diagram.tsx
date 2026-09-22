'use client'

import { useEffect, useRef } from 'react'
import type { PaymentEvent } from '@/domain/events/event'
import type { Dictionary } from '@/i18n'
import { formatDuration } from '@/i18n'
import { useTranslation } from '@/i18n/use-translation'
import {
  type ArrowLabel,
  type ArrowStyle,
  type Lane,
  type LaneId,
  type Mark,
  type Refusal,
  buildSequence,
} from './sequence-model'
import { STATE_VAR } from './ui'

const GUTTER = 130
const LANE_W = 190
const ROW = 40

const STYLE_COLOR: Record<ArrowStyle, string> = {
  request: 'var(--color-accent)',
  response: 'var(--color-state-captured)',
  replay: 'var(--color-state-authorized)',
  error: 'var(--color-state-failed)',
  pending: 'var(--color-state-pending)',
}

const REFUSED_COLOR = 'var(--color-state-failed)'

const ACTIVATION_COLOR = {
  ok: 'var(--color-state-captured)',
  error: 'var(--color-state-failed)',
  lost: 'var(--color-state-failed)',
} as const

function arrowText(label: ArrowLabel, d: Dictionary): string {
  switch (label.key) {
    // The acquirer's own event name. Translating a wire format would be a lie.
    case 'webhook':
      return label.kind
    case 'serverError':
      return d.diagram.serverError(label.status)
    case 'statusResolved':
      return d.diagram.statusResolved(label.status)
    default:
      return d.diagram[label.key]
  }
}

function refusalText(refusal: Refusal, d: Dictionary): string {
  switch (refusal.key) {
    case 'duplicate':
      return d.diagram.refusedDuplicate
    case 'backwards':
      return d.diagram.refusedBackwards(refusal.state)
    case 'other':
      return d.diagram.refusedOther(refusal.reason)
  }
}

function laneText(lane: Lane, d: Dictionary): { label: string; sublabel: string } {
  if (lane.kind === 'system') return d.lanes.system
  if (lane.kind === 'endpoint') return d.lanes.endpoint
  return { label: lane.id, sublabel: d.lanes.acquirer.sublabel }
}

function Arrow({
  mark,
  x,
  d,
  selected,
  onSelect,
}: {
  mark: Extract<Mark, { kind: 'arrow' }>
  x: (lane: LaneId) => number
  d: Dictionary
  selected: boolean
  onSelect: (id: string) => void
}) {
  const from = x(mark.from)
  const target = x(mark.to)
  const forward = target > from
  const y = mark.y + ROW / 2

  // A refused arrow stops short of the lifeline and ends in a wall. It arrived;
  // it was simply not allowed to do anything.
  const tip = mark.refused ? target + (forward ? -16 : 16) : target
  const color = mark.refused ? REFUSED_COLOR : STYLE_COLOR[mark.style]
  const head = forward ? -7 : 7

  return (
    <g
      data-arrow={mark.label.key}
      data-refused={mark.refused?.key}
      data-selected={selected || undefined}
      onClick={() => onSelect(mark.id)}
      className="cursor-pointer"
    >
      {/* A generous invisible target: a 1.5px line is not something to aim at. */}
      <rect
        x={Math.min(from, tip) - 6}
        y={y - 15}
        width={Math.abs(tip - from) + 12}
        height={30}
        rx={6}
        fill={selected ? 'var(--color-raised)' : 'transparent'}
      />
      <line
        x1={from}
        y1={y}
        x2={tip}
        y2={y}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray={mark.style === 'replay' ? '5 3' : undefined}
      />
      <path d={`M ${tip} ${y} l ${head} -4 l 0 8 z`} fill={color} />

      <text
        x={(from + tip) / 2}
        y={y - 11}
        textAnchor="middle"
        className="font-mono"
        fontSize={10.5}
        fill={color}
      >
        {arrowText(mark.label, d)}
      </text>

      {mark.chip && (
        <text
          x={(from + tip) / 2}
          y={y + 14}
          textAnchor="middle"
          className="font-mono"
          fontSize={9}
          fill="var(--color-faint)"
        >
          {mark.chip}
        </text>
      )}

      {mark.via && (
        <g>
          <title>{d.diagram.verified}</title>
          <rect
            x={x(mark.via) - 7}
            y={y - 7}
            width={14}
            height={14}
            rx={3}
            fill="var(--color-canvas)"
            stroke={color}
            strokeWidth={1.2}
          />
          <text
            x={x(mark.via)}
            y={y + 3.5}
            textAnchor="middle"
            className="font-mono"
            fontSize={9}
            fill={color}
          >
            &#10003;
          </text>
        </g>
      )}

      {mark.refused && (
        <g>
          <line
            x1={target}
            y1={y - 11}
            x2={target}
            y2={y + 11}
            stroke={REFUSED_COLOR}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <text
            x={(from + tip) / 2}
            y={y + 15}
            textAnchor="middle"
            className="font-mono"
            fontSize={9.5}
            fill={REFUSED_COLOR}
          >
            {refusalText(mark.refused, d)}
          </text>
        </g>
      )}
    </g>
  )
}

/** A request with nothing coming back: the reply trails off and never lands. */
function Lost({
  mark,
  x,
  d,
}: {
  mark: Extract<Mark, { kind: 'lost' }>
  x: (lane: LaneId) => number
  d: Dictionary
}) {
  const at = x(mark.at)
  const y = mark.y + ROW / 2
  const stop = at - 72

  return (
    <g data-lost={mark.at}>
      <line
        x1={at}
        y1={y}
        x2={stop}
        y2={y}
        stroke="url(#fade-left)"
        strokeWidth={1.5}
        strokeDasharray="4 4"
      />
      <g stroke="var(--color-state-failed)" strokeWidth={1.8} strokeLinecap="round">
        <line x1={at - 5} y1={y - 5} x2={at + 5} y2={y + 5} />
        <line x1={at + 5} y1={y - 5} x2={at - 5} y2={y + 5} />
      </g>
      <text
        x={stop - 8}
        y={y + 4}
        textAnchor="end"
        className="font-mono"
        fontSize={9.5}
        fill="var(--color-state-failed)"
      >
        {d.diagram.noAnswer}
      </text>
    </g>
  )
}

export function SequenceDiagram({
  events,
  selectedEventId,
  onSelect,
}: {
  events: readonly PaymentEvent[]
  selectedEventId: string | null
  onSelect: (id: string) => void
}) {
  const { d } = useTranslation()
  const model = buildSequence(events)
  const endRef = useRef<HTMLDivElement>(null)
  const markCount = model.marks.length

  // Follow the run as it happens, the same way the log does.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [markCount])

  if (model.marks.length === 0) {
    return (
      <p className="px-4 py-10 text-center font-mono text-[11px] text-faint">
        {d.views.emptySequence}
      </p>
    )
  }

  const width = GUTTER + model.lanes.length * LANE_W + 16
  const laneX = (lane: LaneId) => {
    const index = model.lanes.findIndex((entry) => entry.id === lane)
    return GUTTER + (index < 0 ? 0 : index) * LANE_W + LANE_W / 2
  }

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-auto">
      <div style={{ width }} className="mx-auto">
        <div className="sticky top-0 z-10 flex bg-surface">
          <div style={{ width: GUTTER }} />
          {model.lanes.map((lane) => {
            const text = laneText(lane, d)
            return (
              <div key={lane.id} style={{ width: LANE_W }} className="px-2 py-2 text-center">
                <div className="truncate font-mono text-[11px] text-ink">{text.label}</div>
                <div className="truncate font-mono text-[9px] text-faint">{text.sublabel}</div>
              </div>
            )
          })}
        </div>

        <svg width={width} height={model.height} role="img" aria-label={d.views.sequence}>
          <defs>
            <linearGradient id="fade-left" x1="1" x2="0">
              <stop offset="0" stopColor="var(--color-state-failed)" stopOpacity="0.75" />
              <stop offset="1" stopColor="var(--color-state-failed)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {model.lanes.map((lane) => (
            <line
              key={lane.id}
              x1={laneX(lane.id)}
              y1={0}
              x2={laneX(lane.id)}
              y2={model.height}
              stroke="var(--color-hairline)"
              strokeDasharray="3 5"
            />
          ))}

          {/* Activation bars sit under everything: they are the ground the
              arrows land on, not another thing competing for attention. */}
          {model.marks.map((mark) =>
            mark.kind === 'activation' ? (
              <g key={mark.id} data-activation={mark.tone}>
                <rect
                  x={laneX(mark.lane) - 4}
                  y={mark.y}
                  width={8}
                  height={Math.max(4, mark.endY - mark.y)}
                  rx={4}
                  fill={ACTIVATION_COLOR[mark.tone]}
                  fillOpacity={mark.tone === 'lost' ? 0.18 : 0.28}
                />
                {mark.durationMs !== null && mark.endY - mark.y > 22 && (
                  <text
                    x={laneX(mark.lane) + 11}
                    y={(mark.y + mark.endY) / 2 + 3}
                    className="font-mono"
                    fontSize={9}
                    fill="var(--color-faint)"
                  >
                    {formatDuration(mark.durationMs)}
                  </text>
                )}
              </g>
            ) : null,
          )}

          {model.marks.map((mark) => {
            switch (mark.kind) {
              case 'arrow':
                return (
                  <Arrow
                    key={mark.id}
                    mark={mark}
                    x={laneX}
                    d={d}
                    selected={mark.id === selectedEventId}
                    onSelect={onSelect}
                  />
                )

              case 'lost':
                return <Lost key={mark.id} mark={mark} x={laneX} d={d} />

              case 'wait': {
                const delay = formatDuration(mark.delayMs)
                const label =
                  mark.reason === 'backoff' ? d.diagram.backoff(delay) : d.diagram.awaiting(delay)

                return (
                  <g key={mark.id} data-wait={mark.reason}>
                    <rect
                      x={GUTTER - 10}
                      y={mark.y}
                      width={width - GUTTER}
                      height={mark.height}
                      rx={10}
                      fill="var(--color-raised)"
                    />
                    <text
                      x={GUTTER + (width - GUTTER) / 2}
                      y={mark.y + mark.height / 2 + 3.5}
                      textAnchor="middle"
                      className="font-mono"
                      fontSize={10}
                      fill="var(--color-muted)"
                    >
                      {`⏲ ${label}${mark.clamped ? ' ⌇' : ''}`}
                    </text>
                  </g>
                )
              }

              case 'state':
                return (
                  <g key={mark.id} data-sequence-state={mark.state}>
                    <line
                      x1={GUTTER - 10}
                      y1={mark.y + 15}
                      x2={width - 8}
                      y2={mark.y + 15}
                      stroke={STATE_VAR[mark.state]}
                      strokeWidth={1}
                      strokeDasharray="2 4"
                      opacity={0.5}
                    />
                    <text
                      x={GUTTER - 18}
                      y={mark.y + 19}
                      textAnchor="end"
                      className="font-mono"
                      fontSize={10}
                      fill={STATE_VAR[mark.state]}
                    >
                      {mark.state}
                    </text>
                  </g>
                )

              case 'activation':
                return null

              case 'note':
                return (
                  <text
                    key={mark.id}
                    x={GUTTER + (width - GUTTER) / 2}
                    y={mark.y + 19}
                    textAnchor="middle"
                    className="font-mono"
                    fontSize={10}
                    fill="var(--color-state-pending)"
                  >
                    {`⤷ ${d.diagram.failover(mark.provider)}`}
                  </text>
                )
            }
          })}
        </svg>
        <div ref={endRef} />
      </div>
    </div>
  )
}
