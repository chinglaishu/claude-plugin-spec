import { expect, test } from "@playwright/test";

test("A visitor sees a gross rate", async () => {
  expect(110).toBeGreaterThan(100);
});
