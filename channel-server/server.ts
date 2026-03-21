import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'

type BufferEntry = { id: string; chat_id: string; text: string; timestamp: string }

type SendBody = {
  text?: unknown
  user?: unknown
}

const DEFAULT_BUFFER_SIZE = 1000
const bufferSize = Number.parseInt(process.env.BUFFER_SIZE ?? `${DEFAULT_BUFFER_SIZE}`, 10)
const maxBufferSize = Number.isNaN(bufferSize) || bufferSize <= 0 ? DEFAULT_BUFFER_SIZE : bufferSize
const port = Number.parseInt(process.env.PORT ?? '8787', 10)

const instructions = [
  'Transcript output is invisible to the web user unless you explicitly send a reply.',
  'Incoming messages arrive as <channel source="company-os" chat_id="..." user="..." ts="...">...</channel> tags.',
  'Respond to the web user with the reply tool and always pass the same chat_id back.'
].join(' ')

const server = new Server(
  {
    name: 'company-os',
    version: '0.1.0'
  },
  {
    capabilities: {
      experimental: {
        'claude/channel': {}
      },
      tools: {}
    },
    instructions
  }
)

const buffer: BufferEntry[] = []
let nextId = 1
let nextMessageId = 1

function nextCursor(): string {
  const id = `${nextId}`
  nextId += 1
  return id
}

function pushBufferEntry(entry: Omit<BufferEntry, 'id'>): BufferEntry {
  const record: BufferEntry = {
    id: nextCursor(),
    ...entry
  }

  if (buffer.length >= maxBufferSize) {
    buffer.shift()
  }

  buffer.push(record)
  return record
}

function nextMessageCursor(): string {
  const id = `${nextMessageId}`
  nextMessageId += 1
  return id
}

function latestCursor(): string {
  return buffer.at(-1)?.id ?? '0'
}

function jsonHeaders(req: Request): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...corsHeaders(req)
  }
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin')
  if (!origin) {
    return {}
  }

  const configuredOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const allowedOrigins = ['http://localhost:5173', ...configuredOrigins]

  if (!allowedOrigins.includes(origin)) {
    return {}
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  }
}

function optionsResponse(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req)
  })
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'reply',
        description: 'Send a reply to a channel chat_id.',
        inputSchema: {
          type: 'object',
          properties: {
            chat_id: {
              type: 'string',
              description: 'Chat identifier to reply to.'
            },
            text: {
              type: 'string',
              description: 'Message content to send.'
            }
          },
          required: ['chat_id', 'text']
        }
      }
    ]
  }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  if (name !== 'reply') {
    throw new Error(`Unknown tool: ${name}`)
  }

  const chatId = typeof args?.chat_id === 'string' ? args.chat_id : ''
  const text = typeof args?.text === 'string' ? args.text : ''

  if (!chatId || !text) {
    throw new Error('reply requires string chat_id and text arguments')
  }

  pushBufferEntry({
    chat_id: chatId,
    text,
    timestamp: new Date().toISOString()
  })

  return {
    content: [{ type: 'text', text: 'sent' }]
  }
})

Bun.serve({
  port: Number.isNaN(port) || port <= 0 ? 8787 : port,
  routes: {
    '/send': {
      OPTIONS: (req) => optionsResponse(req),
      POST: async (req) => {
        let body: SendBody

        try {
          body = (await req.json()) as SendBody
        } catch {
          return Response.json(
            { error: 'Invalid JSON body' },
            {
              status: 400,
              headers: jsonHeaders(req)
            }
          )
        }

        const text = typeof body.text === 'string' ? body.text : ''
        const user = typeof body.user === 'string' && body.user.trim() ? body.user : 'web'

        if (!text) {
          return Response.json(
            { error: 'text is required' },
            {
              status: 400,
              headers: jsonHeaders(req)
            }
          )
        }

        const messageId = nextMessageCursor()
        const ts = new Date().toISOString()

        try {
          await server.notification({
            method: 'notifications/claude/channel',
            params: {
              content: text,
              meta: {
                chat_id: 'web',
                user,
                message_id: messageId,
                ts
              }
            }
          })
        } catch (error) {
          console.warn('Channel notification failed:', error)
        }

        return Response.json(
          { ok: true },
          {
            headers: jsonHeaders(req)
          }
        )
      }
    },
    '/messages': {
      OPTIONS: (req) => optionsResponse(req),
      GET: (req) => {
        const since = new URL(req.url).searchParams.get('since')
        const sinceCursor = Number.parseInt(since ?? '0', 10)
        const safeCursor = Number.isNaN(sinceCursor) ? 0 : sinceCursor
        const messages = buffer.filter((entry) => Number.parseInt(entry.id, 10) > safeCursor)
        const cursor = messages.at(-1)?.id ?? latestCursor()

        return Response.json(
          {
            messages,
            cursor
          },
          {
            headers: jsonHeaders(req)
          }
        )
      }
    },
    '/health': {
      OPTIONS: (req) => optionsResponse(req),
      GET: (req) =>
        Response.json(
          { status: 'ok' },
          {
            headers: jsonHeaders(req)
          }
        )
    }
  },
  fetch() {
    return new Response('Not Found', { status: 404 })
  }
})

await server.connect(new StdioServerTransport())
