// Semafor pro drahé operace (Chromium na PDF). Jeden start prohlížeče stojí
// stovky MB paměti a vteřiny procesoru; funkce na Vercelu může obsluhovat víc
// požadavků najednou, takže bez stropu stačí pár souběžných stažení PDF
// k tomu, aby instanci zabil nedostatek paměti — a s ní i všechny ostatní
// požadavky, které na ní zrovna běží.

export class SemaphoreTimeoutError extends Error {
  constructor() {
    super('Server je teď zaneprázdněný, zkuste to za chvíli.')
    this.name = 'SemaphoreTimeoutError'
  }
}

export type Semaphore = {
  /** Spustí `task`, až bude volné místo; po `waitMs` čekání se vzdá chybou. */
  run<T>(task: () => Promise<T>): Promise<T>
  /** Kolik úloh teď běží a kolik čeká (pro testy a diagnostiku). */
  stats(): { running: number; waiting: number }
}

export function createSemaphore(limit: number, waitMs: number): Semaphore {
  let running = 0
  const queue: Array<{ start: () => void; timer: ReturnType<typeof setTimeout> }> = []

  function release(): void {
    running -= 1
    const next = queue.shift()
    if (next) {
      clearTimeout(next.timer)
      next.start()
    }
  }

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const start = (): void => {
          running += 1
          // Synchronní výjimka z `task` by jinak místo nikdy neuvolnila.
          let pending: Promise<T>
          try {
            pending = task()
          } catch (error: unknown) {
            pending = Promise.reject(error)
          }
          // Místo se uvolní dřív, než volající dostane výsledek — kdo hned po `await`
          // pustí další úlohu, nesmí narazit na stále obsazený slot.
          pending.then(
            (value) => {
              release()
              resolve(value)
            },
            (error: unknown) => {
              release()
              reject(error)
            },
          )
        }
        if (running < limit) {
          start()
          return
        }
        const waiter = {
          start,
          timer: setTimeout(() => {
            const index = queue.indexOf(waiter)
            if (index !== -1) queue.splice(index, 1)
            reject(new SemaphoreTimeoutError())
          }, waitMs),
        }
        queue.push(waiter)
      })
    },
    stats: () => ({ running, waiting: queue.length }),
  }
}
