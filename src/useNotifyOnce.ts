import { useEffect, useRef } from 'react'

export interface Notice {
  key: string // stable identity; re-arms once the item leaves the list
  title: string
  body: string
}

/**
 * Fire a desktop notification the FIRST time each item appears in the list;
 * once an item drops out (subsided / acknowledged) its key re-arms so a later
 * recurrence notifies again. No-ops unless enabled and OS permission granted.
 */
export function useNotifyOnce(items: Notice[], enabled: boolean): void {
  const seenRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const live = new Set(items.map((i) => i.key))
    for (const k of [...seenRef.current]) {
      if (!live.has(k)) seenRef.current.delete(k)
    }
    if (
      !enabled ||
      typeof Notification === 'undefined' ||
      Notification.permission !== 'granted'
    )
      return
    for (const i of items) {
      if (seenRef.current.has(i.key)) continue
      seenRef.current.add(i.key)
      try {
        new Notification(i.title, { body: i.body, tag: i.key })
      } catch {
        /* notifications best-effort */
      }
    }
  }, [items, enabled])
}
