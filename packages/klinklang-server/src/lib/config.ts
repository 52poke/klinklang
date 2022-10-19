import convict from 'convict'
import { join } from 'path'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'

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
    port: {
      doc: 'Server port',
      format: 'int',
      default: 3000
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
      default: ''
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
  }
})

export type Config = typeof config

export async function loadConfig (): Promise<Config> {
  return config.loadFile(join(await findWorkspaceDir(process.cwd()) ?? '.', 'config.json'))
}
