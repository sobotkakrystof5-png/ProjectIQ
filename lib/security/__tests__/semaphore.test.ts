import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSemaphore, SemaphoreTimeoutError } from '../semaphore'

function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createSemaphore', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('spustí nejvýš `limit` úloh najednou, ostatní čekají na uvolnění', async () => {
    const sem = createSemaphore(2, 30_000)
    const gates = [deferred(), deferred(), deferred()]
    const started: number[] = []
    const runs = gates.map((gate, i) =>
      sem.run(async () => {
        started.push(i)
        await gate.promise
        return i
      }),
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(started).toEqual([0, 1])
    expect(sem.stats()).toEqual({ running: 2, waiting: 1 })

    gates[0]!.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(started).toEqual([0, 1, 2])

    gates[1]!.resolve()
    gates[2]!.resolve()
    await expect(Promise.all(runs)).resolves.toEqual([0, 1, 2])
    expect(sem.stats()).toEqual({ running: 0, waiting: 0 })
  })

  it('chyba úlohy místo neuvolní', async () => {
    const sem = createSemaphore(1, 30_000)
    await expect(sem.run(() => Promise.reject(new Error('Chromium spadl')))).rejects.toThrow('Chromium spadl')
    await expect(sem.run(async () => 'ok')).resolves.toBe('ok')
    expect(sem.stats().running).toBe(0)
  })

  it('synchronní výjimka úlohy místo taky uvolní', async () => {
    const sem = createSemaphore(1, 30_000)
    const boom = (): Promise<string> => {
      throw new Error('spadlo hned')
    }
    await expect(sem.run(boom)).rejects.toThrow('spadlo hned')
    await expect(sem.run(async () => 'ok')).resolves.toBe('ok')
    expect(sem.stats().running).toBe(0)
  })

  it('čekající se po vypršení vzdá chybou a z fronty zmizí', async () => {
    const sem = createSemaphore(1, 1_000)
    const blocker = deferred()
    const first = sem.run(() => blocker.promise)
    const waiting = sem.run(async () => 'nikdy')
    const assertion = expect(waiting).rejects.toBeInstanceOf(SemaphoreTimeoutError)
    await vi.advanceTimersByTimeAsync(1_000)
    await assertion
    expect(sem.stats()).toEqual({ running: 1, waiting: 0 })

    blocker.resolve()
    await first
    expect(sem.stats().running).toBe(0)
  })
})
