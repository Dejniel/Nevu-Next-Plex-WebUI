import { loadPageWindow } from "./loadPageWindow";

it("loads only distinct relevant offsets and skips windows beyond a shortened list", async () => {
  const fetch = vi.fn(async (offset: number) => ({
    offset,
    total: 150,
    items: [offset],
  }));
  const result = await loadPageWindow(fetch, [0, 100, 100, 200, 300]);
  expect(fetch.mock.calls.map(([offset]) => offset)).toEqual([0, 100]);
  expect([...result.items]).toEqual([
    [0, 0],
    [100, 100],
  ]);
});

it.each([
  { offset: 100, total: 201, generationId: "one" },
  { offset: 101, total: 200, generationId: "one" },
  { offset: 100, total: 200, generationId: "two" },
])(
  "rejects changing totals, offsets or generations instead of publishing a mixed window",
  async (second) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        offset: 0,
        total: 200,
        generationId: "one",
        items: ["old"],
      })
      .mockResolvedValueOnce({ ...second, items: ["new"] });
    await expect(loadPageWindow(fetch, [0, 100])).rejects.toThrow("changed");
  },
);

it("limits concurrency and resolves only after the whole replacement window is ready", async () => {
  let active = 0;
  let maximum = 0;
  const completions: Array<() => void> = [];
  const fetch = (offset: number) => {
    if (offset === 0)
      return Promise.resolve({ offset, total: 500, items: [0] });
    active++;
    maximum = Math.max(maximum, active);
    return new Promise<{ offset: number; total: number; items: number[] }>(
      (resolve) => {
        completions.push(() => {
          active--;
          resolve({ offset, total: 500, items: [offset] });
        });
      },
    );
  };
  let published = false;
  const pending = loadPageWindow(fetch, [0, 100, 200, 300, 400]).then(
    (value) => {
      published = true;
      return value;
    },
  );
  await Promise.resolve();
  expect(completions).toHaveLength(2);
  completions.shift()!();
  await Promise.resolve();
  expect(published).toBe(false);
  while (completions.length) {
    completions.shift()!();
    await Promise.resolve();
  }
  const result = await pending;
  expect(maximum).toBe(2);
  expect(result.items.size).toBe(5);
});

it("learns a missing total from the last page without leaving an infinite unknown tail", async () => {
  const fetch = async (offset: number) => ({
    offset,
    total: null,
    hasMore: offset === 0,
    items: Array.from(
      { length: offset === 0 ? 100 : 3 },
      (_, index) => offset + index,
    ),
  });
  const result = await loadPageWindow(fetch, [0, 100]);
  expect(result.total).toBe(103);
  expect(result.items.size).toBe(103);
});
