// Runtime render coverage for the viewer revamp (the client-JS behaviours that renderViewer's
// static HTML can't show on its own): the Feature/Flow tab split, Health removal, flow-kind grouping
// with no FE/BE/cache, document created/updated dates + the stale badge, and the conflict "newest"
// marker. We render viewer.template.html with a tiny synthetic graph (the real graph has zero
// flow-kind tests) and execute it in JSDOM.
//
// JSDOM is a devDependency OF THIS TOOL. It used to be resolved out of a sibling frontend package
// three directories up ("which already depends on it, so this adds no new devDependency") — true
// while the tool lived inside that workspace, and false the moment it became a package of its own.
// After the port the require failed, the suite self-skipped, and 13 tests stopped running silently.
// A test that borrows another project's node_modules is coupled to that project as surely as a
// hardcoded path is (REQ-0), and one that vanishes when the borrow fails is worse than one that
// fails: nothing says so.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";
import { renderViewer } from "./viewer";
import type { Graph } from "./types";

const graph = {
  generatedAt: "2026-07-12T10:00:00+08:00",
  nodes: [
    { id: "main:hv-freeze", type: "doc", title: "House View Freeze", path: "svc_backend/.github/system-design/00_platform/hv-freeze.md", body: "House View freeze.", created: "2026-03-02", updated: "2026-06-18", reviewedAt: "2026-01-05" },
    { id: "main:portfolio", type: "doc", title: "Portfolio Modeler", path: "svc_backend/.github/system-design/50_portfolio/portfolio.md", body: "Portfolio.", created: "2026-05-01", updated: "2026-07-10", reviewedAt: "2026-07-01" },
    { id: "add.page", type: "feature", title: "Add Property", flow: "add", page: true },
    { id: "add.mapping", type: "feature", title: "Column mapping", flow: "add" },
    { id: "frontend:ADD-1", type: "test", kind: "e2e", e2eKind: "feature", title: "Column mapping scenario", status: "pass", spec: "add.spec.ts", steps: [] },
    { id: "frontend:ADD-FLOW-1", type: "test", kind: "e2e", e2eKind: "flow", title: "Add property end-to-end", status: "pass", spec: "add.spec.ts", runAt: "2026-07-05T09:00:00+08:00", steps: [{ action: "Upload file", expected: "grid shows" }] },
    { id: "REQ-ADD-1", type: "requirement", title: "Mapping applies", text: "Mapping applies", provenBy: ["frontend:ADD-1"] },
  ],
  edges: [
    { from: "frontend:ADD-1", to: "add.mapping", type: "tags", source: "x" },
    { from: "frontend:ADD-FLOW-1", to: "add.page", type: "tags", source: "x" },
    { from: "add.mapping", to: "REQ-ADD-1", type: "specifies", source: "x" },
    { from: "frontend:ADD-1", to: "REQ-ADD-1", type: "covers", source: "x" },
  ],
  issues: [],
  health: {
    flows: [{ flow: "add", label: "Add Property", capabilities: 2, tested: 2, untested: [], failing: [], flaky: [], reqTotal: 1, reqProven: 1, unproven: [], lastVerified: "2026-07-05T09:00:00+08:00" }],
    totals: { features: 2, tested: 2, reqTotal: 1, reqProven: 1, failing: 0, flaky: 0 },
  },
  registries: {},
  conflicts: [{
    id: "c1", subject: "Freeze semantics", scope: "add", category: "definition", severity: "med", axis: "doc", tags: ["hv"],
    why: "Two docs disagree on when freeze happens",
    participants: [
      { kind: "doc", ref: "main:hv-freeze", span: "overview", quote: "at publish", positionId: "p1" },
      { kind: "doc", ref: "main:portfolio", span: "model", quote: "at draft", positionId: "p2" },
    ],
    positions: [
      { id: "p1", statement: "freeze at publish", heldBy: ["main:hv-freeze"] },
      { id: "p2", statement: "freeze at draft", heldBy: ["main:portfolio"] },
    ],
  }],
} as unknown as Graph;

// No skip guard: jsdom is a devDependency now, so an unresolvable import is a broken install to fix,
// not a suite to quietly drop.
describe("viewer revamp — runtime render", () => {
  let dom: any, doc: any;
  const click = (el: any) => el && el.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  const tab = (label: string) => [...doc.querySelectorAll("#tabs .tab")].find((t: any) => t.textContent.includes(label));

  beforeAll(async () => {
    const template = await readFile(join(fileURLToPath(new URL(".", import.meta.url)), "..", "viewer.template.html"), "utf8");
    const html = renderViewer(graph, template, null);
    dom = new JSDOM(html, {
      runScripts: "dangerously", url: "file:///viewer.html", pretendToBeVisual: true,
      beforeParse(w: any) {
        w.marked = { parse: (s: string) => s, parseInline: (s: string) => s };
        w.scrollTo = () => {};
        w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      },
    });
    doc = dom.window.document;
  });

  it("shows the new tab set: Summary / Feature tests / Flow tests / Knowledge map / Conflicts — no Health", () => {
    const tabs = [...doc.querySelectorAll("#tabs .tab")].map((t: any) => t.textContent);
    expect(tabs.some((t: string) => /Health/.test(t))).toBe(false);
    expect(tabs.some((t: string) => /Feature tests/.test(t))).toBe(true);
    expect(tabs.some((t: string) => /Flow tests/.test(t))).toBe(true);
  });

  it("Flow tests lists the flow-kind journey grouped by flow, with status chips and NO FE/BE/cache", () => {
    click(tab("Flow tests"));
    const text = doc.getElementById("list").textContent || "";
    expect(text).toMatch(/Add Property/);           // flow group header
    expect(text).toMatch(/Add property end-to-end/); // the flow case
    expect(text).not.toMatch(/FE unit|BE unit|Cache/i);
    expect(doc.querySelector(".statchips")).toBeTruthy();
  });

  it("gives Feature tests, Flow tests AND Knowledge map a consistent left sidebar via a shared primitive", () => {
    const sideHtml = () => doc.getElementById("side").innerHTML;
    const shared = (html: string) => /class="h"/.test(html) && /class="node/.test(html);
    // Feature tests → App areas
    click(tab("Feature tests"));
    expect(doc.getElementById("side").textContent).toMatch(/App areas/);
    expect(shared(sideHtml())).toBe(true);
    // Flow tests → a NEW Flows category sidebar (was empty before), same primitive
    click(tab("Flow tests"));
    const flowSide = doc.getElementById("side");
    expect(flowSide.textContent).toMatch(/Flows/);
    expect(flowSide.textContent).toMatch(/All flows/);
    expect(flowSide.querySelector("[data-flowsel]")).toBeTruthy(); // a flow category row
    expect(shared(sideHtml())).toBe(true);
    // Knowledge map → Categories, same primitive
    click(tab("Knowledge map"));
    expect(doc.getElementById("side").textContent).toMatch(/Categories/);
    expect(shared(sideHtml())).toBe(true);
  });

  it("Flow tests sidebar filters the journey list to the picked flow", () => {
    click(tab("Flow tests"));
    // pick the 'add' flow category → list shows only that flow's journeys
    const addCat = [...doc.querySelectorAll("[data-flowsel]")].find((n: any) => /Add Property/.test(n.textContent));
    expect(addCat).toBeTruthy();
    click(addCat);
    expect(doc.getElementById("list").textContent).toMatch(/Add property end-to-end/);
  });

  it("keeps feature-scenario e2e in Feature tests and excludes flow-kind (each case lives in one tab)", () => {
    click(tab("Feature tests"));
    // add.mapping is tagged only by the feature-kind case → E2E meter shows 1, flow journey absent.
    // Navigate via the sidebar (always present in this view) since featPage state persists.
    click(doc.querySelector('[data-fp="add.mapping"]'));
    const text = doc.getElementById("list").textContent || "";
    expect(text).toMatch(/1\s*E2E/);
    expect(text).not.toMatch(/Add property end-to-end/); // the flow-kind case is NOT duplicated here
    // add.page is tagged only by the flow-kind case → a pointer sends you to the Flow tests tab.
    click(doc.querySelector('[data-fp="add.page"]'));
    expect(doc.querySelector("[data-goflow]")).toBeTruthy();
  });

  it("card detail bodies use a distinct class so the app-shell '.body' flex row can't leak into them (layout regression)", () => {
    // Root cause of the broken Feature/Flow card layout: the Vercel-style shell wrapper (<div class="body">
    // with .body{display:flex;overflow:hidden}) and the expandable card's inner detail block BOTH used
    // class="body". The shell rule cascaded into every open card, turning its vertical label→value stack
    // (Covers / Verifies / Exercises) into a clipped horizontal row. Guard the invariant: exactly one
    // .body element (the shell) exists in the document even with a card expanded, and card details carry
    // their own class instead.
    click(tab("Feature tests"));
    click(doc.querySelector('[data-fp="add.mapping"]'));
    const reqHead = doc.querySelector('[data-req="REQ-ADD-1"]');
    expect(reqHead).toBeTruthy();
    click(reqHead);                                           // expand the requirement card → renders a detail block
    expect(doc.querySelector(".card.open .detail")).toBeTruthy(); // the card detail uses the dedicated class
    expect(doc.querySelectorAll(".body").length).toBe(1);     // …and only the shell keeps the .body class
  });

  it("Summary renders from the health block", () => {
    click(tab("Summary"));
    expect(doc.getElementById("list").textContent || "").toMatch(/promises proven|capabilities mapped/i);
  });

  it("Knowledge map shows document created + updated dates and flags a stale doc", () => {
    dom.window.location.hash = "#doc=main:hv-freeze";
    dom.window.dispatchEvent(new dom.window.Event("hashchange"));
    click(tab("Knowledge map"));
    click(doc.querySelector("#side [data-jump]"));
    const dates = doc.querySelector(".doc-dates");
    expect(dates).toBeTruthy();
    expect(dates.textContent).toMatch(/created 2026-03-02/);
    expect(dates.textContent).toMatch(/updated 2026-06-18/);
    expect(doc.querySelector(".stale-badge")).toBeTruthy(); // reviewed 2026-01-05 is >90d old
  });

  it("Conflicts shows each doc's date and marks the most recently updated as newest", () => {
    click(tab("Conflicts"));
    expect(doc.querySelector(".conf-date")).toBeTruthy();
    const newest = doc.querySelector(".newest-chip");
    expect(newest).toBeTruthy();
  });

  it("puts the section tabs in the top header and the App-areas panel in the left sidebar (Vercel-style shell)", () => {
    // Primary section nav lives in the top header…
    expect(doc.querySelector(".topbar #tabs .tab")).toBeTruthy();
    expect(doc.querySelector(".rail")).toBeNull(); // …not a left rail
    // …and the contextual sidebar is the left column of the body.
    expect(doc.querySelector(".body .side#side")).toBeTruthy();
    // Settings + Guide are header actions.
    expect(doc.querySelector(".topbar-actions #config-open")).toBeTruthy();
    expect(doc.querySelector(".topbar-actions #help-open")).toBeTruthy();
  });

  it("the Guide reflects the current tabs (no stale 'By feature' / Health wording)", () => {
    const guide = doc.getElementById("intro-pop").textContent || "";
    expect(guide).toMatch(/Feature tests/);
    expect(guide).toMatch(/Flow tests/);
    expect(guide).toMatch(/Conflicts/);
    expect(guide).not.toMatch(/By feature/);
  });

  it("has an Auto/Light/Dark theme control in Settings that forces the resolved theme via data-theme", () => {
    // (Persistence to localStorage is exercised by the code but can't be asserted here: JSDOM's
    // file:// opaque origin makes localStorage throw, which the viewer swallows by design. The
    // active-button + data-theme assertions below prove the toggle mechanics; persistence-across-
    // reload is verified in the browser.)
    const root = doc.documentElement;
    // The theme buttons live in the Settings panel but are wired independently of its open state,
    // so we drive them directly and leave the panel's hidden state untouched for later specs.
    const btnAuto = doc.getElementById("theme-auto");
    const btnLight = doc.getElementById("theme-light");
    const btnDark = doc.getElementById("theme-dark");
    expect(btnAuto && btnLight && btnDark).toBeTruthy();
    // Force dark — overrides the OS preference regardless of prefers-color-scheme.
    click(btnDark);
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(btnDark.classList.contains("on")).toBe(true);
    expect(btnLight.classList.contains("on")).toBe(false);
    // Force light.
    click(btnLight);
    expect(root.getAttribute("data-theme")).toBe("light");
    expect(btnLight.classList.contains("on")).toBe(true);
    // Auto → resolves off the OS (matchMedia stub reports light here) and marks Auto active.
    click(btnAuto);
    expect(root.getAttribute("data-theme")).toBe("light");
    expect(btnAuto.classList.contains("on")).toBe(true);
    expect(btnDark.classList.contains("on")).toBe(false);
  });

  it("consolidates status + GitHub token + display into ONE Settings panel toggled from the header", () => {
    // the old separate header chips no longer exist
    expect(doc.getElementById("settings-open")).toBeNull();
    expect(doc.getElementById("ghtoken-open")).toBeNull();
    const pop = doc.getElementById("config-pop");
    expect(pop.hidden).toBe(true);
    click(doc.getElementById("config-open"));
    expect(pop.hidden).toBe(false);
    // all three concerns live in the one panel
    expect(pop.querySelector("#fresh")).toBeTruthy();            // status
    expect(pop.querySelector("#ghtoken-input")).toBeTruthy();     // GitHub token
    expect(pop.querySelector("#vis-unit-fe")).toBeTruthy();       // display
    click(doc.getElementById("config-close"));
    expect(pop.hidden).toBe(true);
  });
});
