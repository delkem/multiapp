import * as Immutable from 'immutable';
import reducer, {
  addAppItem,
  addDivider,
  changeAppItemPosition,
  removeAppItem,
  removeDivider,
  renameDivider,
} from '../../../src/dock/duck';
import { createDividerItem, isDividerItem, parseDividerItem } from '../../../src/dock/dividers';

const dock = (...items: string[]) => Immutable.List(items) as any;
const labels = (state: any) => state.toArray().map((i: string) => isDividerItem(i) ? `|${parseDividerItem(i).label}|` : i);

describe('dock dividers encoding', () => {
  it('round-trips labels, including special characters', () => {
    const item = createDividerItem('abc', 'Work: 100% / ✨');
    expect(isDividerItem(item)).toBe(true);
    expect(parseDividerItem(item)).toEqual({ dividerId: 'abc', label: 'Work: 100% / ✨' });
  });

  it('trims, collapses whitespace and caps label length', () => {
    expect(parseDividerItem(createDividerItem('a', '  my   work  ')).label).toBe('my work');
    expect(parseDividerItem(createDividerItem('a', 'x'.repeat(100))).label).toHaveLength(40);
  });

  it('does not treat application ids as dividers', () => {
    expect(isDividerItem('slack-123')).toBe(false);
    expect(isDividerItem(undefined)).toBe(false);
  });

  it('rejects ids containing the separator', () => {
    expect(() => createDividerItem('a:b')).toThrow();
  });
});

describe('dock reducer with dividers', () => {
  it('appends a divider when no anchor is given', () => {
    const state = reducer(dock('a', 'b'), addDivider('d1'));
    expect(labels(state)).toEqual(['a', 'b', '||']);
  });

  it('inserts a divider right after the given item', () => {
    const state = reducer(dock('a', 'b', 'c'), addDivider('d1', 'a', 'Work'));
    expect(labels(state)).toEqual(['a', '|Work|', 'b', 'c']);
  });

  it('appends when the anchor is unknown', () => {
    const state = reducer(dock('a'), addDivider('d1', 'nope'));
    expect(labels(state)).toEqual(['a', '||']);
  });

  it('ignores duplicate divider ids', () => {
    const s1 = reducer(dock('a'), addDivider('d1'));
    expect(reducer(s1, addDivider('d1'))).toBe(s1);
  });

  it('renames in place and keeps position', () => {
    let state = reducer(dock('a', 'b'), addDivider('d1', 'a'));
    state = reducer(state, renameDivider('d1', 'Personal'));
    expect(labels(state)).toEqual(['a', '|Personal|', 'b']);
    expect(parseDividerItem(state.get(1)).dividerId).toBe('d1');
  });

  it('removes a divider', () => {
    let state = reducer(dock('a', 'b'), addDivider('d1', 'a'));
    state = reducer(state, removeDivider('d1'));
    expect(labels(state)).toEqual(['a', 'b']);
  });

  it('moves a divider like an app', () => {
    let state = reducer(dock('a', 'b', 'c'), addDivider('d1'));
    state = reducer(state, changeAppItemPosition(state.get(3), 1));
    expect(labels(state)).toEqual(['a', '||', 'b', 'c']);
  });

  it('ignores moves of unknown items instead of dropping the last entry', () => {
    const state = dock('a', 'b');
    expect(reducer(state, changeAppItemPosition('ghost', 0))).toBe(state);
  });

  it('keeps app add/remove behaviour', () => {
    let state = reducer(dock('a'), addDivider('d1'));
    state = reducer(state, addAppItem('b'));
    state = reducer(state, removeAppItem('a'));
    expect(labels(state)).toEqual(['||', 'b']);
  });
});
