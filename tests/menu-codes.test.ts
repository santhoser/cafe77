import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, hashPassword, seed } from "../server/db.js";
import { mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { openWorkersDatabase, createWorkerHttpApp } from "./workers/fixture.js";
import { hashPassword as workerPassword } from "../workers/crypto.js";
import { generateGroupCode, nextItemNumber } from "../shared/menu-codes.js";

test("name-derived group codes follow examples and skip collisions", () => {
  const used = new Set<string>();
  for (const [name, expected] of [
    ["Cold Coffee", "CF"],
    ["Mocktails & Mojitos", "MM"],
    ["Pastries", "PA"],
    ["Special Shakes", "SS"],
    ["Special Smoothie", "SM"],
    ["Smoothie", "SE"],
  ]) {
    const code = generateGroupCode(name, used);
    assert.equal(code, expected);
    used.add(code);
  }
  assert.notEqual(generateGroupCode("cold coffee", used), "CF");
  assert.match(generateGroupCode("123 &", used), /^[A-Z]{2}$/);
  assert.equal(nextItemNumber(["CF101", "PA103"]), "102");
  assert.throws(() =>
    nextItemNumber(Array.from({ length: 899 }, (_, i) => "CF" + (i + 101))),
  );
});

test("local legacy codes upgrade once while keeping owner menu edits", () => {
  const directory = mkdtempSync(join(tmpdir(), "cafe77-codes-"));
  const path = join(directory, "legacy.sqlite");
  let db = openDatabase(path);
  try {
    seed(db);
    db.exec(
      "DROP INDEX groups_code_unique; DROP INDEX menu_number_unique; ALTER TABLE groups DROP COLUMN code; UPDATE menu SET code='I' || printf('%03d',id); UPDATE menu SET details='Owner description',price=12345 WHERE id=1",
    );
    db.close();
    db = openDatabase(path);
    const item = db
      .prepare("SELECT code,details,price FROM menu WHERE id=1")
      .get();
    assert.equal(item?.code, "CF101");
    assert.equal(item?.details, "Owner description");
    assert.equal(item?.price, 12345);
    db.close();
    db = openDatabase(path);
    assert.deepEqual(
      db.prepare("SELECT code,details,price FROM menu WHERE id=1").get(),
      item,
    );
  } finally {
    db.close();
    unlinkSync(path);
    rmdirSync(directory);
  }
});

for (const runtime of ["SQLite", "D1"] as const) {
  test(`${runtime}: allocated codes, collisions, edits, group moves and historical order snapshots`, async () => {
    const db =
      runtime === "SQLite" ? openDatabase(":memory:") : openWorkersDatabase();
    const password = "Codes-Test-Password-42";
    db.prepare(
      "INSERT INTO users(username,password,role) VALUES('codeowner',?,'owner')",
    ).run(
      await (runtime === "SQLite" ? hashPassword : workerPassword)(password),
    );
    const app = runtime === "SQLite" ? createApp(db) : createWorkerHttpApp(db);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
    let cookie = "";
    const call = async (path: string, method = "GET", body?: unknown) => {
      const response = await fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: response.status,
        data: (await response.json()) as any,
        cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
      };
    };
    try {
      assert.equal(
        (await call("/admin/groups", "POST", { name: "Unauthorised" })).status,
        401,
      );
      cookie = (
        await call("/auth/login", "POST", { username: "codeowner", password })
      ).cookie;
      const initial = (await call("/admin/menu")).data;
      const item = initial.items[0];
      const oldCode = item.code;
      const order = await call("/admin/orders", "POST", {
        table: 1,
        name: "Code snapshot",
        requestKey: crypto.randomUUID(),
        items: [{ id: item.id, quantity: 1 }],
      });
      assert.equal(order.status, 201);
      // Simultaneous names must allocate different codes instead of accepting caller codes.
      const groups = await Promise.all(
        [1, 2].map(() =>
          call("/admin/groups", "POST", {
            name: "Collision Group",
            code: "ZZ",
          }),
        ),
      );
      assert.deepEqual(
        groups.map((r) => r.status),
        [200, 200],
      );
      let menu = (await call("/admin/menu")).data;
      const created = menu.groups.filter(
        (g: any) => g.name === "Collision Group",
      );
      assert.equal(created.length, 2);
      assert.notEqual(created[0].code, created[1].code);
      assert.notEqual(created[0].code, "ZZ");
      const group = created[0];
      assert.equal(
        (
          await call(`/admin/groups/${group.id}`, "PUT", {
            ...group,
            code: initial.groups[0].code.toLowerCase(),
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await call(`/admin/groups/${group.id}`, "PUT", {
            ...group,
            code: "A1",
          })
        ).status,
        400,
      );
      const adds = await Promise.all(
        [1, 2].map((n) =>
          call("/admin/menu", "POST", {
            ...item,
            groupId: group.id,
            name: `Allocated ${n}`,
            code: "ZZ999",
            codeNumber: "999",
          }),
        ),
      );
      assert.deepEqual(
        adds.map((r) => r.status),
        [200, 200],
      );
      menu = (await call("/admin/menu")).data;
      const added = menu.items.filter((i: any) =>
        i.name.startsWith("Allocated "),
      );
      assert.equal(new Set(added.map((i: any) => i.code)).size, 2);
      assert.ok(
        added.every(
          (i: any) => i.code.startsWith(group.code) && !i.code.endsWith("999"),
        ),
      );
      assert.equal(
        (
          await call(`/admin/menu/${item.id}`, "PUT", {
            ...item,
            codeNumber: added[0].code.slice(2),
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await call(`/admin/menu/${item.id}`, "PUT", {
            ...item,
            codeNumber: "100",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await call(`/admin/menu/${item.id}`, "PUT", {
            ...item,
            groupId: group.id,
            code: "ZZ999",
          })
        ).status,
        200,
      );
      assert.equal(
        db.prepare("SELECT code FROM menu WHERE id=?").get(item.id)?.code,
        group.code + oldCode.slice(2),
      );
      assert.equal(
        (
          await call(`/admin/groups/${group.id}`, "PUT", {
            ...group,
            code: "zx",
          })
        ).status,
        200,
      );
      assert.equal(
        db.prepare("SELECT code FROM menu WHERE id=?").get(item.id)?.code,
        "ZX" + oldCode.slice(2),
      );
      const moved = (await call("/admin/menu")).data.items.find(
        (i: any) => i.id === item.id,
      );
      assert.equal(
        (
          await call(`/admin/menu/${item.id}`, "PUT", {
            ...moved,
            codeNumber: "999",
          })
        ).status,
        200,
      );
      assert.equal(
        db.prepare("SELECT code FROM menu WHERE id=?").get(item.id)?.code,
        "ZX999",
      );
      assert.equal(
        db.prepare("SELECT code FROM order_items WHERE item_id=?").get(item.id)
          ?.code,
        oldCode,
      );
      assert.equal(
        db.prepare("SELECT code FROM groups WHERE id=?").get(group.id)?.code,
        "ZX",
      );
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      const history = db
        .prepare(
          "SELECT before_json,after_json FROM menu_history WHERE menu_item_id=? ORDER BY id DESC LIMIT 1",
        )
        .get(item.id)!;
      assert.equal(JSON.parse(String(history.after_json)).code, "ZX999");
      assert.equal(
        JSON.parse(String(history.before_json)).code,
        "ZX" + oldCode.slice(2),
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
    }
  });
}
