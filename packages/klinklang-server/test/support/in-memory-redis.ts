interface SortedSetEntry {
  member: string
  score: number
}

export class InMemoryRedis {
  readonly strings = new Map<string, string>()
  readonly expirations = new Map<string, number>()
  readonly sortedSets = new Map<string, Map<string, number>>()

  async set (key: string, value: string, ...args: Array<string | number>): Promise<'OK' | null> {
    await Promise.resolve()
    if (args.includes('NX') && this.strings.has(key)) {
      return null
    }
    this.strings.set(key, value)
    const expiryIndex = args.indexOf('EX')
    const seconds = args[expiryIndex + 1]
    if (expiryIndex >= 0 && typeof seconds === 'number') {
      this.expirations.set(key, seconds)
    }
    return 'OK'
  }

  async get (key: string): Promise<string | null> {
    await Promise.resolve()
    return this.strings.get(key) ?? null
  }

  async mget (...keys: string[]): Promise<Array<string | null>> {
    await Promise.resolve()
    return keys.map(key => this.strings.get(key) ?? null)
  }

  async zadd (key: string, score: number, member: string): Promise<number> {
    await Promise.resolve()
    const entries = this.sortedSets.get(key) ?? new Map<string, number>()
    const added = entries.has(member) ? 0 : 1
    entries.set(member, score)
    this.sortedSets.set(key, entries)
    return added
  }

  async zrevrange (key: string, start: number, stop: number): Promise<string[]> {
    await Promise.resolve()
    const entries = this.sortedEntries(key).reverse()
    const end = stop < 0 ? entries.length + stop + 1 : stop + 1
    return entries.slice(start, Math.max(start, end)).map(entry => entry.member)
  }

  async zrem (key: string, ...members: string[]): Promise<number> {
    await Promise.resolve()
    const entries = this.sortedSets.get(key)
    if (entries === undefined) {
      return 0
    }
    let removed = 0
    for (const member of members) {
      if (entries.delete(member)) {
        removed += 1
      }
    }
    return removed
  }

  async zremrangebyscore (key: string, minimum: string | number, maximum: string | number): Promise<number> {
    await Promise.resolve()
    const entries = this.sortedSets.get(key)
    if (entries === undefined) {
      return 0
    }
    const min = minimum === '-inf' ? Number.NEGATIVE_INFINITY : Number(minimum)
    const max = maximum === '+inf' ? Number.POSITIVE_INFINITY : Number(maximum)
    let removed = 0
    for (const [member, score] of entries) {
      if (score >= min && score <= max && entries.delete(member)) {
        removed += 1
      }
    }
    return removed
  }

  async zremrangebyrank (key: string, start: number, stop: number): Promise<number> {
    await Promise.resolve()
    const entries = this.sortedEntries(key)
    const normalizedStart = start < 0 ? Math.max(0, entries.length + start) : start
    const normalizedStop = stop < 0 ? entries.length + stop : stop
    if (normalizedStop < normalizedStart) {
      return 0
    }
    const members = entries.slice(normalizedStart, normalizedStop + 1).map(entry => entry.member)
    return await this.zrem(key, ...members)
  }

  async expire (key: string, seconds: number): Promise<number> {
    await Promise.resolve()
    const exists = this.strings.has(key) || this.sortedSets.has(key)
    if (exists) {
      this.expirations.set(key, seconds)
    }
    return exists ? 1 : 0
  }

  private sortedEntries (key: string): SortedSetEntry[] {
    return Array.from(this.sortedSets.get(key)?.entries() ?? [])
      .map(([member, score]) => ({ member, score }))
      .sort((left, right) => {
        const scoreDifference = left.score - right.score
        return scoreDifference === 0 ? left.member.localeCompare(right.member) : scoreDifference
      })
  }
}
