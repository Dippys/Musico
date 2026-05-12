import type {
  AutoplayMode,
  QueueItem,
  QueueState,
  RepeatMode,
} from "./types.js";

export interface QueueAdvanceOptions {
  force?: boolean;
}

export interface QueueServiceOptions {
  autoplayMode?: AutoplayMode;
  currentItem?: QueueItem | null;
  history?: readonly QueueItem[];
  items?: readonly QueueItem[];
  repeatMode?: RepeatMode;
}

const cloneItems = (items: readonly QueueItem[]): QueueItem[] => {
  return [...items];
};

export class QueueService {
  private autoplayMode: AutoplayMode;
  private currentItem: QueueItem | null;
  private history: QueueItem[];
  private items: QueueItem[];
  private repeatMode: RepeatMode;

  public constructor(options: QueueServiceOptions = {}) {
    this.autoplayMode = options.autoplayMode ?? "off";
    this.currentItem = options.currentItem ?? null;
    this.history = cloneItems(options.history ?? []);
    this.items = cloneItems(options.items ?? []);
    this.repeatMode = options.repeatMode ?? "off";
  }

  public add(item: QueueItem): number {
    this.items.push(item);
    return this.items.length;
  }

  public addMany(items: readonly QueueItem[]): number {
    this.items.push(...items);
    return this.items.length;
  }

  public addNext(item: QueueItem): number {
    this.items.unshift(item);
    return this.items.length;
  }

  public clear(): QueueItem[] {
    const cleared = cloneItems(this.items);
    this.items = [];
    return cleared;
  }

  public get size(): number {
    return this.items.length;
  }

  public move(fromIndex: number, toIndex: number): boolean {
    if (
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= this.items.length ||
      toIndex >= this.items.length
    ) {
      return false;
    }

    if (fromIndex === toIndex) {
      return true;
    }

    const [item] = this.items.splice(fromIndex, 1);

    if (!item) {
      return false;
    }

    this.items.splice(toIndex, 0, item);
    return true;
  }

  public next(options: QueueAdvanceOptions = {}): QueueItem | null {
    if (this.currentItem && this.repeatMode === "track" && !options.force) {
      return this.currentItem;
    }

    if (this.currentItem) {
      this.history.push(this.currentItem);

      if (this.repeatMode === "queue" && !options.force) {
        this.items.push(this.currentItem);
      }
    }

    this.currentItem = this.items.shift() ?? null;
    return this.currentItem;
  }

  public previous(): QueueItem | null {
    const previousItem = this.history.pop() ?? null;

    if (!previousItem) {
      return null;
    }

    if (this.currentItem) {
      this.items.unshift(this.currentItem);
    }

    this.currentItem = previousItem;
    return this.currentItem;
  }

  public remove(index: number): QueueItem | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.items.length) {
      return null;
    }

    const [removedItem] = this.items.splice(index, 1);
    return removedItem ?? null;
  }

  public setAutoplayMode(mode: AutoplayMode): AutoplayMode {
    this.autoplayMode = mode;
    return this.autoplayMode;
  }

  public setCurrentItem(item: QueueItem | null): QueueItem | null {
    this.currentItem = item;
    return this.currentItem;
  }

  public setRepeatMode(mode: RepeatMode): RepeatMode {
    this.repeatMode = mode;
    return this.repeatMode;
  }

  public shuffle(random: () => number = Math.random): void {
    for (let index = this.items.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [this.items[index], this.items[swapIndex]] = [
        this.items[swapIndex] as QueueItem,
        this.items[index] as QueueItem,
      ];
    }
  }

  public snapshot(): QueueState {
    return {
      autoplayMode: this.autoplayMode,
      currentItem: this.currentItem,
      history: cloneItems(this.history),
      items: cloneItems(this.items),
      repeatMode: this.repeatMode,
    };
  }
}