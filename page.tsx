'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Copy, Trash2, RefreshCw, Filter, SortAsc, Layers, X } from 'lucide-react'

type MagnetLink = {
  original: string
  title: string
  metadata: string
  episode: string
}

const STORAGE_KEY = 'magnetLinksData'

function parseEpisode(str: string): { season: number; episode: number } | null {
  const match = str.match(/S(\d+)E(\d+)/i)
  if (match) {
    return { season: parseInt(match[1]), episode: parseInt(match[2]) }
  }
  return null
}

function getEpisodeKey(link: MagnetLink): string {
  const ep = parseEpisode(link.episode || link.title || '')
  if (ep) {
    return `S${String(ep.season).padStart(2, '0')}E${String(ep.episode).padStart(2, '0')}`
  }
  return link.original
}

export default function MagnetLinksPage() {
  const [links, setLinks] = useState<MagnetLink[]>([])
  const [filter, setFilter] = useState('')
  const [status, setStatus] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setLinks(JSON.parse(stored) || [])
      }
    } catch {
      setLinks([])
    }
  }, [])

  // Save to localStorage when links change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links))
  }, [links])

  // Listen for cross-tab sync
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setLinks(JSON.parse(e.newValue) || [])
        } catch {
          // ignore
        }
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  // Listen for BroadcastChannel messages
  useEffect(() => {
    try {
      const bc = new BroadcastChannel('magnet-links')
      bc.onmessage = (e) => {
        if (e.data?.type === 'MAGNET_DATA' && e.data.payload) {
          ingestLinks(e.data.payload, 'BroadcastChannel')
        }
      }
      return () => bc.close()
    } catch {
      // BroadcastChannel not supported
    }
  }, [])

  // Listen for postMessage
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'MAGNET_DATA' && event.data.payload) {
        ingestLinks(event.data.payload, 'postMessage')
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Expose global function for window.opener
  useEffect(() => {
    (window as unknown as { receiveMagnetData: (data: unknown) => void }).receiveMagnetData = (data: unknown) => {
      ingestLinks(data, 'receiveMagnetData')
    }
  }, [])

  const showStatus = useCallback((msg: string) => {
    setStatus(msg)
    if (msg) {
      setTimeout(() => setStatus((current) => (current === msg ? '' : current)), 3000)
    }
  }, [])

  const ingestLinks = useCallback((data: unknown, source?: string) => {
    let items: unknown[] = []
    if (Array.isArray(data)) {
      items = data
    } else if (typeof data === 'string') {
      items = [data]
    } else {
      return
    }

    const normalized: MagnetLink[] = items
      .map((item) => {
        if (typeof item === 'string') {
          return { original: item, title: item, metadata: '', episode: '' }
        }
        const obj = item as Record<string, unknown>
        return {
          original: String(obj.original || obj.magnet || obj.link || ''),
          title: String(obj.title || obj.name || obj.original || ''),
          metadata: String(obj.metadata || ''),
          episode: String(obj.episode || ''),
        }
      })
      .filter((x) => x.original)

    if (normalized.length > 0) {
      setLinks((prev) => [...prev, ...normalized])
      showStatus(`Received ${normalized.length} link(s)${source ? ` via ${source}` : ''}`)
    }
  }, [showStatus])

  // Multi-keyword filter: ALL keywords must match (space-separated)
  const filteredLinks = links.filter((link) => {
    if (!filter.trim()) return true
    const keywords = filter.toLowerCase().split(/\s+/).filter(Boolean)
    const searchText = `${link.original} ${link.title} ${link.metadata} ${link.episode}`.toLowerCase()
    return keywords.every((kw) => searchText.includes(kw))
  })

  const copyAll = async () => {
    const text = filteredLinks.map((l) => l.original).join('\n')
    if (!text) {
      showStatus('Nothing to copy')
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      showStatus(`Copied ${filteredLinks.length} link(s) to clipboard`)
    } catch {
      showStatus('Copy failed')
    }
  }

  const sortByEpisode = () => {
    setLinks((prev) => {
      const sorted = [...prev].sort((a, b) => {
        const epA = parseEpisode(a.episode || a.title || '')
        const epB = parseEpisode(b.episode || b.title || '')
        if (!epA && !epB) return 0
        if (!epA) return 1
        if (!epB) return -1
        if (epA.season !== epB.season) return epA.season - epB.season
        return epA.episode - epB.episode
      })
      return sorted
    })
    showStatus('Sorted by episode')
  }

  const removeDuplicates = () => {
    const seen = new Map<string, MagnetLink>()
    links.forEach((link) => {
      const key = getEpisodeKey(link)
      if (!seen.has(key)) {
        seen.set(key, link)
      }
    })
    const unique = Array.from(seen.values())
    const removed = links.length - unique.length
    setLinks(unique)
    showStatus(removed > 0 ? `Removed ${removed} duplicate(s)` : 'No duplicates found')
  }

  const clearAll = () => {
    if (links.length === 0) {
      showStatus('Already empty')
      return
    }
    if (confirm(`Clear all ${links.length} stored magnet link(s)? This cannot be undone.`)) {
      setLinks([])
      localStorage.removeItem(STORAGE_KEY)
      showStatus('All links cleared')
    }
  }

  const resetFilter = () => {
    setFilter('')
  }

  const fetchFromApi = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/magnets')
      const data = await res.json()
      if (data.links && data.links.length > 0) {
        setLinks((prev) => [...prev, ...data.links])
        showStatus(`Fetched ${data.links.length} link(s) from API`)
      } else {
        showStatus('No links on server')
      }
    } catch {
      showStatus('Failed to fetch from API')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Magnet Links</CardTitle>
            <CardDescription>
              {links.length} total link(s) | {filteredLinks.length} shown
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <Button onClick={copyAll} variant="outline" size="sm">
                <Copy className="mr-2 h-4 w-4" />
                Copy All
              </Button>
              <Button onClick={sortByEpisode} variant="outline" size="sm">
                <SortAsc className="mr-2 h-4 w-4" />
                Sort by Episode
              </Button>
              <Button onClick={removeDuplicates} variant="outline" size="sm">
                <Layers className="mr-2 h-4 w-4" />
                Remove Duplicates
              </Button>
              <Button onClick={fetchFromApi} variant="outline" size="sm" disabled={isLoading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Fetch from API
              </Button>
              <Button onClick={clearAll} variant="destructive" size="sm">
                <Trash2 className="mr-2 h-4 w-4" />
                Clear All
              </Button>
            </div>

            {/* Filter Input */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Filter by keywords (e.g. csi s04 playweb)"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="pl-10"
                />
              </div>
              {filter && (
                <Button onClick={resetFilter} variant="ghost" size="icon">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Status */}
            {status && (
              <div className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-md">
                {status}
              </div>
            )}

            {/* Links List */}
            <div className="max-h-[60vh] overflow-y-auto rounded-md border bg-muted/30 p-4">
              {filteredLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No links to display. {links.length > 0 && `(${links.length} hidden by filter)`}
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredLinks.map((link, idx) => (
                    <div
                      key={idx}
                      className="text-xs font-mono break-all p-2 bg-background rounded border hover:bg-accent/50 transition-colors"
                    >
                      <div className="text-foreground">{link.title !== link.original ? link.title : ''}</div>
                      <a
                        href={link.original}
                        className="text-primary hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {link.original}
                      </a>
                      {link.metadata && (
                        <div className="text-muted-foreground mt-1">{link.metadata}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bookmarklet Section */}
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                Bookmarklet (drag to bookmarks bar)
              </summary>
              <div className="mt-2 rounded-md border bg-muted/50 p-4 space-y-3">
                <p className="text-muted-foreground text-xs">
                  Drag this button to your bookmarks bar. Click it on any page with magnet links to send them here.
                </p>
                <a
                  href={`javascript:(function(){var u='${typeof window !== 'undefined' ? window.location.origin : 'YOUR_APP_URL'}/api/magnets';var links=[...document.querySelectorAll('a[href^="magnet:"]')].map(function(a){return{original:a.href,title:a.textContent.trim()||a.href,metadata:'',episode:''}});if(links.length===0){alert('No magnet links found on this page.');return;}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({links:links})}).then(function(r){return r.json()}).then(function(d){alert('Sent '+links.length+' magnet link(s) to your app!')}).catch(function(e){alert('Failed to send: '+e.message)})})();`}
                  className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium text-sm hover:bg-primary/90 cursor-grab"
                  onClick={(e) => {
                    e.preventDefault()
                    showStatus('Drag this to your bookmarks bar!')
                  }}
                >
                  Send Magnets
                </a>
                <div className="mt-3">
                  <p className="text-muted-foreground text-xs mb-1">Or copy the bookmarklet code:</p>
                  <code className="block bg-background p-2 rounded text-xs break-all select-all">
                    {`javascript:(function(){var u='${typeof window !== 'undefined' ? window.location.origin : 'YOUR_APP_URL'}/api/magnets';var links=[...document.querySelectorAll('a[href^="magnet:"]')].map(function(a){return{original:a.href,title:a.textContent.trim()||a.href,metadata:'',episode:''}});if(links.length===0){alert('No magnet links found on this page.');return;}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({links:links})}).then(function(r){return r.json()}).then(function(d){alert('Sent '+links.length+' magnet link(s) to your app!')}).catch(function(e){alert('Failed to send: '+e.message)})})();`}
                  </code>
                </div>
              </div>
            </details>

            {/* API Usage Instructions */}
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                API Usage (curl)
              </summary>
              <div className="mt-2 rounded-md border bg-muted/50 p-4 font-mono text-xs space-y-4">
                <div>
                  <p className="text-muted-foreground mb-1"># POST single link:</p>
                  <code className="block bg-background p-2 rounded">
                    {`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/magnets \\
  -H "Content-Type: application/json" \\
  -d '{"original":"magnet:?xt=...","title":"Show.S01E01"}'`}
                  </code>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1"># POST multiple links:</p>
                  <code className="block bg-background p-2 rounded">
                    {`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/magnets \\
  -H "Content-Type: application/json" \\
  -d '{"links":[{"original":"magnet:?xt=...","title":"S01E01"},{"original":"magnet:?xt=..."}]}'`}
                  </code>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1"># GET all links:</p>
                  <code className="block bg-background p-2 rounded">
                    {`curl ${typeof window !== 'undefined' ? window.location.origin : ''}/api/magnets`}
                  </code>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1"># DELETE all links:</p>
                  <code className="block bg-background p-2 rounded">
                    {`curl -X DELETE ${typeof window !== 'undefined' ? window.location.origin : ''}/api/magnets`}
                  </code>
                </div>
              </div>
            </details>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
