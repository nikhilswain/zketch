export interface Job {
  key: string;
  priority: number;
  step(deadline: number): boolean;
}

export class Scheduler {
  private jobs = new Map<string, Job>();

  constructor(private now: () => number = () => performance.now()) {}

  add(job: Job): void {
    this.jobs.set(job.key, job);
  }

  has(key: string): boolean {
    return this.jobs.has(key);
  }

  cancel(prefix: string): void {
    for (const k of [...this.jobs.keys()]) if (k.startsWith(prefix)) this.jobs.delete(k);
  }

  get pending(): number {
    return this.jobs.size;
  }

  run(budgetMs: number): number {
    const deadline = this.now() + budgetMs;
    let finished = 0;
    while (this.jobs.size && this.now() < deadline) {
      let next: Job | null = null;
      for (const job of this.jobs.values()) if (!next || job.priority < next.priority) next = job;
      if (next!.step(deadline)) {
        if (this.jobs.get(next!.key) === next) this.jobs.delete(next!.key);
        finished++;
      }
    }
    return finished;
  }
}
