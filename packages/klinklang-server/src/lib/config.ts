import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import convict from 'convict'
import { join } from 'node:path'

const config = convict({
  app: {
    secret: {
      doc: 'Secret of Klinklang app',
      format: String,
      default: '',
      env: 'KLINKLANG_SECRET'
    },
    prefix: {
      doc: 'Prefix for sessions',
      format: String,
      default: 'klinklang'
    },
    host: {
      doc: 'Server host',
      format: String,
      default: '::'
    },
    port: {
      doc: 'Server port',
      format: 'int',
      default: 3000,
      env: 'PORT'
    },
    devPort: {
      doc: 'Server port in development',
      format: 'int',
      default: 0,
      env: 'DEV_PORT'
    },
    url: {
      doc: 'App URL',
      format: String,
      default: 'http://localhost:3000'
    },
    bootstrap: {
      doc: 'Bootstrap workflow config',
      format: String,
      default: './workflow.yml'
    }
  },
  db: {
    url: {
      doc: 'Database URL',
      format: String,
      default: '',
      env: 'DB_URL'
    }
  },
  mediawiki: {
    scriptPath: {
      doc: 'Script path of your MediaWiki installation',
      format: String,
      default: 'https://en.wikipedia.org/w/'
    },
    oauthKey: {
      doc: 'OAuth consumer key',
      format: String,
      default: '',
      env: 'WIKI_OAUTH_KEY'
    },
    oauthSecret: {
      doc: 'OAuth consumer secret',
      format: String,
      default: '',
      env: 'WIKI_OAUTH_SECRET'
    },
    oauthCallback: {
      doc: 'OAuth callback url',
      format: String,
      default: 'oob'
    }
  },
  redis: {
    host: {
      doc: 'Redis host',
      format: String,
      default: 'redis'
    },
    port: {
      doc: 'Redis port',
      format: 'int',
      default: 6379
    }
  },
  kafka: {
    brokers: {
      doc: 'Kafka broker list',
      format: Array,
      default: ['kafka:9092']
    },
    groupId: {
      doc: 'Kafka consumer group id',
      format: String,
      default: 'klinklang'
    }
  },
  discord: {
    token: {
      doc: 'Discord token',
      format: String,
      env: 'DISCORD_TOKEN',
      default: ''
    }
  },
  llm: {
    baseUrl: {
      doc: 'OpenAI-compatible API base URL',
      format: String,
      default: 'https://openrouter.ai/api/v1',
      env: 'LLM_BASE_URL'
    },
    apiKey: {
      doc: 'LLM API key',
      format: String,
      default: '',
      env: 'LLM_API_KEY'
    },
    model: {
      doc: 'LLM model name',
      format: String,
      default: 'nvidia/nemotron-3-nano-30b-a3b:free',
      env: 'LLM_MODEL'
    }
  }
})

export type Config = typeof config

export async function loadConfig (): Promise<Config> {
  return config.loadFile(join(await findWorkspaceDir(process.cwd()) ?? '.', 'config.json'))
}
