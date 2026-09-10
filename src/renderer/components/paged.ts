/** A page of a long list, and the controls that decide what a page is. */

import { clear, el, on } from './dom.js';
import type { Settings } from '../../shared/types.js';

export type PageSize = Settings['pipelinePageSize'];
export const PAGE_SIZES: readonly PageSize[] = [10, 20, 50, 100];

/** Which page, held by the caller so a redraw after a move does not send you back to
 *  the first one. */
export interface Page { at: number }

/** What the control is, which is the shape you are looking at. Pressing it moves to the
 *  next one; the icon is drawn in the stylesheet so no glyph reaches the phrase list. */
const LAYOUT_NAME: Record<Settings['pipelineLayout'], string> = {
  list: 'List view', grid: 'Grid view', board: 'Board view',
};

/** One thing that can be done to a set of rows at once. The field is whatever the
 *  action needs before it can run -- a reason, a channel, a stage. */
export interface BulkChoice<T> {
  id: string;
  label: string;
  field?: {
    label: string;
    /** A picker when there is a list to pick from, a box when there is not. */
    options?: readonly (readonly [string, string])[];
    placeholder?: string;
  };
  /** How many things this actually changes, where that is not one per row. A screen
   *  can list one role twice, and a confirm naming the rows would promise more than the
   *  action does. */
  counts?: (rows: readonly T[]) => number;
  /** What the confirm asks, with the count in it. Nothing runs before this is answered. */
  asks: (count: number, value: string) => string;
  run: (rows: readonly T[], value: string) => Promise<unknown>;
}

export interface BulkOptions<T> {
  /** Stable per row, so a tick survives a redraw and a page turn. */
  keyOf: (row: T) => string;
  /** Held by the caller, for the same reason the page is. */
  chosen: Set<string>;
  choices: readonly BulkChoice<T>[];
  /** Called once the work is done, so the caller can draw the view again. */
  done: () => void;
}

/** In batches, so a set of three thousand does not open three thousand calls at once
 *  and so the order rows are written in is the order they were listed in. */
async function each<T>(rows: readonly T[], run: (row: T) => Promise<unknown>): Promise<void> {
  for (let at = 0; at < rows.length; at += 20) {
    await Promise.all(rows.slice(at, at + 20).map(run));
  }
}

export { each as inBatches };

export interface PagedOptions<T> {
  items: readonly T[];
  page: Page;
  size: PageSize;
  onSize: (size: PageSize) => void;
  /** Absent on a list that has only one shape. */
  layout?: {
    current: Settings['pipelineLayout'];
    /** The shapes this list can take, in the order the control cycles them. */
    shapes: readonly Settings['pipelineLayout'][];
    onChange: (next: Settings['pipelineLayout']) => void;
  };
  /** Draws one page. The host is cleared first and is the caller's to shape. */
  render: (into: HTMLElement, shown: readonly T[]) => void;
  /** Something the caller wants at the left of the bar, before the count. A control,
   *  not a sentence -- a second run of words beside the count is two labels competing
   *  for the same corner. */
  lead?: () => HTMLElement;
  /** What the count is counting, and anything worth saying beside it. Both sit inside
   *  the count so there is one line of one size rather than two. */
  noun?: string;
  note?: string;
  /** Added to the grid container, for a list whose cards need different room. */
  gridClass?: string;
  /** What can be done to several rows at once. Absent on a list where nothing can. */
  bulk?: BulkOptions<T>;
}

export function paged<T>(host: HTMLElement, options: PagedOptions<T>): void {
  const { items, page } = options;
  let size = options.size;
  let layout = options.layout?.current ?? 'list';

  const bar = el('div', { class: 'pagebar' });
  const acts = el('div', { class: 'bulkbar', hidden: true });
  const list = el('div', {});
  host.append(bar, acts, list);
  const bulk = options.bulk;

  /** The three sets a bulk action can be pointed at. `all` is everything the tab holds
   *  after its filters, which is usually far more than is on screen -- so it is named
   *  with its count and confirmed like the others. */
  const scopes = (shown: readonly T[]): { id: string; label: string; rows: readonly T[] }[] => {
    if (!bulk) return [];
    const picked = items.filter((row) => bulk.chosen.has(bulk.keyOf(row)));
    return [
      { id: 'selected', label: `Selected ${picked.length}`, rows: picked },
      { id: 'page', label: `This page ${shown.length}`, rows: shown },
      { id: 'all', label: `Everything here ${items.length}`, rows: items },
    ];
  };

  let scope = 'selected';
  let choice = '';

  const draw = (): void => {
    const pages = Math.max(1, Math.ceil(items.length / size));
    if (page.at >= pages) page.at = pages - 1;
    if (page.at < 0) page.at = 0;
    const from = page.at * size;
    const shown = items.slice(from, from + size);

    clear(list);
    list.className = layout === 'grid' ? `rolegrid${options.gridClass ? ` ${options.gridClass}` : ''}` : '';
    options.render(list, shown);
    if (bulk) drawTicks(shown);

    clear(bar);
    if (options.lead) bar.append(options.lead());

    // One control showing the shape you are in, at the far right past the paging,
    // because it is the thing on this bar you press least often.
    let shape: HTMLElement | null = null;
    if (options.layout) {
      const order = options.layout.shapes;
      const next = order[(order.indexOf(layout) + 1) % order.length] ?? order[0];
      if (next !== undefined) {
        shape = el('button', {
          class: `btn shape shape-${layout}`, type: 'button',
          'aria-label': LAYOUT_NAME[layout], title: LAYOUT_NAME[layout],
        });
        on(shape, 'click', () => {
          layout = next;
          options.layout?.onChange(next);
          draw();
        });
      }
    }

    // Arrows rather than words: the two most-pressed controls on the bar are a
    // direction, and "Previous" is four times the width of the thing it does.
    const back = el('button', {
      class: 'btn step step-back', type: 'button', 'aria-label': 'Previous', title: 'Previous',
    });
    const forward = el('button', {
      class: 'btn step step-on', type: 'button', 'aria-label': 'Next', title: 'Next',
    });
    if (page.at === 0) back.setAttribute('disabled', 'true');
    if (page.at >= pages - 1) forward.setAttribute('disabled', 'true');
    on(back, 'click', () => { page.at -= 1; draw(); host.scrollIntoView({ block: 'start' }); });
    on(forward, 'click', () => { page.at += 1; draw(); host.scrollIntoView({ block: 'start' }); });

    const perPage = el('select', { class: 'perpage', 'aria-label': 'How many per page' },
      ...PAGE_SIZES.map((option) => el('option',
        option === size ? { value: String(option), selected: 'selected' } : { value: String(option) },
        String(option))));
    on(perPage, 'change', () => {
      // Keep the first item on screen where it is, so the control that decides how much
      // you see does not also decide where you are.
      const first = page.at * size;
      size = Number((perPage as HTMLSelectElement).value) as PageSize;
      page.at = Math.floor(first / size);
      options.onSize(size);
      draw();
    });

    // "roles" and "page" are both said by the bar they are standing on.
    const controls = el('div', { class: 'inline controls' },
      back, el('small', {}, `${page.at + 1} / ${pages}`), forward, perPage);
    if (shape) controls.append(shape);
    const counted = `${from + 1}–${from + shown.length} of ${items.length}`
      + (options.noun ? ` ${options.noun}` : '');
    if (bulk) bar.append(pageTick(shown));
    bar.append(
      el('span', { class: 'pagecount' },
        counted, options.note ? el('small', {}, ` · ${options.note}`) : null),
      controls);
    drawActs(shown);
  };

  /** The one control that is always there: it ticks the page you are looking at.
   *  Everything else appears once something is ticked, because a row of actions above
   *  a list nobody has chosen from decides nothing. */
  function pageTick(shown: readonly T[]): HTMLElement {
    const all = shown.length > 0 && shown.every((row) => bulk?.chosen.has(bulk.keyOf(row)));
    const tick = el('input', { type: 'checkbox', class: 'picktop', 'aria-label': 'Select this page' });
    if (all) tick.setAttribute('checked', 'checked');
    on(tick, 'change', () => {
      if (!bulk) return;
      for (const row of shown) {
        if (all) bulk.chosen.delete(bulk.keyOf(row));
        else bulk.chosen.add(bulk.keyOf(row));
      }
      draw();
    });
    return tick;
  }

  function drawTicks(shown: readonly T[]): void {
    if (!bulk) return;
    const drawn = Array.from(list.children);
    // One element per row is what every caller draws. Where that is not true the ticks
    // are left off rather than guessed at: a tick against the wrong row is worse than none.
    if (drawn.length !== shown.length) return;
    shown.forEach((row, at) => {
      const child = drawn[at];
      if (child === undefined) return;
      const key = bulk.keyOf(row);
      const tick = el('input', { type: 'checkbox', 'aria-label': 'Select this one' });
      if (bulk.chosen.has(key)) tick.setAttribute('checked', 'checked');
      const wrap = el('div', { class: 'picked' });
      child.replaceWith(wrap);
      wrap.append(tick, child);
      on(tick, 'change', () => {
        if ((tick as HTMLInputElement).checked) bulk.chosen.add(key);
        else bulk.chosen.delete(key);
        wrap.classList.toggle('on', (tick as HTMLInputElement).checked);
        drawActs(shown);
      });
      wrap.classList.toggle('on', bulk.chosen.has(key));
    });
  }

  function drawActs(shown: readonly T[]): void {
    if (!bulk) return;
    clear(acts);
    const sets = scopes(shown);
    const picked = sets[0]?.rows.length ?? 0;
    acts.hidden = picked === 0;
    if (picked === 0) { scope = 'selected'; return; }

    const where = el('select', { class: 'bulkscope', 'aria-label': 'What to act on' });
    for (const one of sets) {
      const option = el('option', { value: one.id }, one.label);
      if (one.id === scope) option.setAttribute('selected', 'true');
      where.append(option);
    }
    on(where, 'change', () => { scope = (where as HTMLSelectElement).value; drawActs(shown); });

    const what = el('select', { class: 'bulkwhat', 'aria-label': 'What to do' },
      el('option', { value: '' }, 'Choose what to do'));
    for (const one of bulk.choices) {
      const option = el('option', { value: one.id }, one.label);
      if (one.id === choice) option.setAttribute('selected', 'true');
      what.append(option);
    }
    on(what, 'change', () => { choice = (what as HTMLSelectElement).value; drawActs(shown); });

    const chosen = bulk.choices.find((one) => one.id === choice) ?? null;
    const rows = sets.find((one) => one.id === scope)?.rows ?? [];

    let value: HTMLElement | null = null;
    if (chosen?.field) {
      value = chosen.field.options
        ? el('select', { class: 'bulkvalue', 'aria-label': chosen.field.label },
            ...chosen.field.options.map(([id, label]) => el('option', { value: id }, label)))
        : el('input', {
            type: 'text', class: 'bulkvalue wide', 'aria-label': chosen.field.label,
            placeholder: chosen.field.placeholder ?? chosen.field.label,
          });
    }

    const clearAll = el('button', { class: 'btn quiet', type: 'button' }, 'Clear');
    on(clearAll, 'click', () => { bulk.chosen.clear(); draw(); });

    const go = el('button', { class: 'btn solid', type: 'button' }, 'Apply');
    if (chosen === null || rows.length === 0) go.setAttribute('disabled', 'true');
    on(go, 'click', () => {
      if (chosen === null || rows.length === 0) return;
      const said = value === null ? '' : (value as HTMLInputElement | HTMLSelectElement).value;
      askFirst(chosen, rows, said, shown);
    });

    acts.append(el('span', { class: 'bulkcount' }, `${picked} selected`), where, what);
    if (value) acts.append(value);
    acts.append(go, clearAll);
  }

  /** Nothing runs on a set until the set has been named and counted out loud. */
  function askFirst(chosen: BulkChoice<T>, rows: readonly T[], said: string,
                    shown: readonly T[]): void {
    clear(acts);
    const go = el('button', { class: 'btn solid', type: 'button' }, 'Do it');
    const not = el('button', { class: 'btn quiet', type: 'button' }, 'Cancel');
    on(not, 'click', () => drawActs(shown));
    const count = chosen.counts ? chosen.counts(rows) : rows.length;
    on(go, 'click', () => {
      go.setAttribute('disabled', 'true');
      not.setAttribute('disabled', 'true');
      clear(acts);
      acts.append(el('span', { class: 'bulkcount' }, `${chosen.label}: ${count} to do.`));
      void chosen.run(rows, said).then(() => {
        options.bulk?.chosen.clear();
        options.bulk?.done();
      });
    });
    acts.append(el('span', { class: 'bulkcount' }, chosen.asks(count, said)), go, not);
  }

  draw();
}
