import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

/**
 * Minimal markdown renderer for Mirror AI answers.
 *
 * Deliberately dependency-free and escaping-safe: it never injects HTML, so a
 * model reply (untrusted text) cannot introduce markup. Supported: headings,
 * bullet and numbered lists, tables, blockquotes, fenced code and inline
 * bold/italic/code.
 */

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g

function inline(text: string, key: string): ReactNode[] {
  const parts = text.split(INLINE).filter((part) => part !== '')
  return parts.map((part, index) => {
    const id = `${key}-${index}`
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={id} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={id} className="rounded border border-lineSoft bg-subtle px-1 py-px font-mono text-[10px] text-ink">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={id} className="italic">
          {part.slice(1, -1)}
        </em>
      )
    }
    return <span key={id}>{part}</span>
  })
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2
}

function isDivider(line: string): boolean {
  return /^\|?[\s:-]+\|[\s|:-]*$/.test(line.trim()) && line.includes('-')
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = (text ?? '').replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    if (trimmed.startsWith('```')) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      blocks.push(
        <pre key={`code-${index}`} className="overflow-x-auto rounded border border-lineSoft bg-subtle p-2 font-mono text-[10px] leading-relaxed text-ink">
          {code.join('\n')}
        </pre>,
      )
      continue
    }

    if (/^#{1,4}\s/.test(trimmed)) {
      const level = trimmed.match(/^#+/)?.[0].length ?? 1
      const content = trimmed.replace(/^#+\s*/, '')
      blocks.push(
        <p
          key={`h-${index}`}
          className={cn(
            'font-semibold text-ink',
            level <= 2 ? 'text-[13px]' : 'text-[12px] uppercase tracking-[0.04em] text-muted',
          )}
        >
          {inline(content, `h-${index}`)}
        </p>,
      )
      index += 1
      continue
    }

    if (isTableRow(trimmed)) {
      const header = cells(trimmed)
      const rows: string[][] = []
      index += 1
      if (index < lines.length && isDivider(lines[index])) index += 1
      while (index < lines.length && isTableRow(lines[index])) {
        rows.push(cells(lines[index]))
        index += 1
      }
      blocks.push(
        <div key={`table-${index}`} className="overflow-x-auto">
          <table className="w-full border-collapse text-[10.5px]">
            <thead>
              <tr>
                {header.map((cell, cellIndex) => (
                  <th
                    key={`th-${cellIndex}`}
                    className="border-b border-lineSoft pb-1 pr-3 text-left font-mono text-[8.5px] uppercase tracking-[0.06em] text-faint"
                  >
                    {inline(cell, `th-${cellIndex}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`tr-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`td-${rowIndex}-${cellIndex}`} className="border-b border-lineSoft/60 py-1 pr-3 text-muted">
                      {inline(cell, `td-${rowIndex}-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    if (trimmed.startsWith('>')) {
      const quote: string[] = []
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quote.push(lines[index].trim().replace(/^>\s?/, ''))
        index += 1
      }
      blocks.push(
        <blockquote key={`q-${index}`} className="border-l-2 border-cyan/40 pl-2.5 text-[10.5px] leading-relaxed text-faint">
          {inline(quote.join(' '), `q-${index}`)}
        </blockquote>,
      )
      continue
    }

    if (/^[-*]\s/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^[-*]\s/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s*/, ''))
        index += 1
      }
      blocks.push(
        <ul key={`ul-${index}`} className="ml-3 list-disc space-y-1">
          {items.map((item, itemIndex) => (
            <li key={`li-${itemIndex}`} className="pl-0.5">
              {inline(item, `li-${index}-${itemIndex}`)}
            </li>
          ))}
        </ul>,
      )
      continue
    }

    if (/^\d+[.)]\s/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^\d+[.)]\s/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+[.)]\s*/, ''))
        index += 1
      }
      blocks.push(
        <ol key={`ol-${index}`} className="ml-3 list-decimal space-y-1">
          {items.map((item, itemIndex) => (
            <li key={`oli-${itemIndex}`} className="pl-0.5">
              {inline(item, `oli-${index}-${itemIndex}`)}
            </li>
          ))}
        </ol>,
      )
      continue
    }

    const paragraph: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^#{1,4}\s/.test(lines[index].trim()) &&
      !isTableRow(lines[index].trim()) &&
      !/^[-*]\s/.test(lines[index].trim()) &&
      !/^\d+[.)]\s/.test(lines[index].trim()) &&
      !lines[index].trim().startsWith('>') &&
      !lines[index].trim().startsWith('```')
    ) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    blocks.push(<p key={`p-${index}`}>{inline(paragraph.join(' '), `p-${index}`)}</p>)
  }

  return <div className={cn('space-y-2 leading-relaxed', className)}>{blocks}</div>
}
