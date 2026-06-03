import { NextRequest, NextResponse } from 'next/server'

export type MagnetLink = {
  original: string
  title: string
  metadata: string
  episode: string
}

// In-memory storage (will reset on server restart)
// For persistent storage, you'd use a database
let magnetLinks: MagnetLink[] = []

// CORS headers for cross-origin requests (bookmarklet support)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// Handle preflight requests
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function GET() {
  return NextResponse.json(
    { links: magnetLinks, count: magnetLinks.length },
    { headers: corsHeaders }
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Accept single link or array of links
    let incoming: unknown[] = Array.isArray(body) ? body : body.links ? body.links : [body]
    
    const normalized: MagnetLink[] = incoming.map((item: unknown) => {
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
    }).filter(x => x.original)
    
    magnetLinks = [...magnetLinks, ...normalized]
    
    return NextResponse.json(
      { success: true, added: normalized.length, total: magnetLinks.length },
      { headers: corsHeaders }
    )
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid JSON payload' }, 
      { status: 400, headers: corsHeaders }
    )
  }
}

export async function DELETE() {
  const count = magnetLinks.length
  magnetLinks = []
  return NextResponse.json(
    { success: true, cleared: count },
    { headers: corsHeaders }
  )
}
