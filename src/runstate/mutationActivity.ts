export class MutationActivity {
  private count = 0

  begin(): () => void {
    this.count++
    let released = false
    return () => {
      if (!released) {
        released = true
        this.count--
      }
    }
  }

  get active(): boolean {
    return this.count > 0
  }

  async track<T>(work: () => Promise<T>): Promise<T> {
    const release = this.begin()
    try {
      return await work()
    } finally {
      release()
    }
  }
}
