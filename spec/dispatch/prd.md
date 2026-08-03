---
screen: dispatch
area: Running
title: Dispatch panel
route: /run/:job
---

## R1 — One panel per job, opened by the cell you clicked

The job knows its screen and its task, so nothing has to be typed. "Rewrite the losing side
of the conflict for checkout-page" is the whole instruction.

*Rewritten 2026-08-03 — resolved conflict 90a990d1: the human picked board R7 as canon (specboard
owns no wireframe), so the example job can no longer be a wireframe draft. The point of R1 is
unchanged: the job carries its own context.*

## R2 — The work is visible while it runs

Claude's output streams into the panel. A button that goes quiet for two minutes gets
clicked again, and the second run fights the first.

## R3 — Finishing updates the board without a reload

The cell the job was fixing changes state in place. If a gate is now due, it opens.

## R4 — One job at a time; a person's second job takes over, a nested run shares the slot

Only one job runs at a time — two agents editing one wireframe is a corrupted file and a confusing
diff. So when a person starts a second job while one is running, the running job is **cancelled and
the new one takes its place** — not queued, and no longer bounced with a refusal the person then has
to read, Cancel, and re-issue by hand. The cancelled job's partial work is left on disk (R5) and its
log stays readable.

Takeover cancels only the job actually **holding** the slot, never a job it is nested inside. The one
exception to "one at a time" is still a run started by the run already going — a spec proving the run
panel has to start a run to have anything to prove. Nesting is checked **first** and never triggers a
takeover, so a suite that runs itself can never cancel the run executing it: a nested run names the
run it is nested in, and nesting is **bounded** to a chain short enough that such a suite stops
instead of recursing. A request that names a parent is only ever a nest attempt — mis-named or too
deep, it is refused, never a takeover.

*Corrected 2026-07-28: this said "one job per SCREEN at a time", which was never what the code did —
the slot has always been global. Worse, it made the dispatch row the one row on the board that could
not be run: clicking Run put the run in the slot, and this spec's first act is to wait for that slot
to be free, so it waited for itself and timed out at a blank browser window. The nesting exception is
what makes the board able to run every row, including the one that tests running.*

*Changed 2026-07-29: a person's second job used to be REFUSED; it now takes over the slot
(cancel-and-run). A refusal the person has to read, then Cancel, then re-issue is three steps to do
the one thing they plainly meant. The nesting exception is unchanged and is still evaluated before any
takeover, so it stays impossible for a run to cancel its own parent — only the job holding the slot is
cancelled, and a nested run's ancestors keep the slot and resume when the takeover job ends.*

## R5 — Cancel actually stops it

The process is killed, and the partial work is left in place rather than rolled back, so you
can see how far it got.

Cancel may name the job it means. Unnamed it stops whatever is running, which is what the panel's
button wants; named, it refuses unless that is really the job in hand — so a request to stop one job
can never stop a different one that happens to be running by then.

*Added 2026-07-28: without this, a spec cancelling the run it had started killed the run that was
executing the spec instead, once nesting made those two different things. The suite stopped itself
half way through and reported nothing.*

## R6 — The whole log is kept, not just the verdict

Every line the job printed is saved with the run and can be read back in full afterwards — not a
truncated snippet, and not only while you happened to be watching it scroll past. "7 of 7 passed"
is the headline; the reason a case failed lives in its output, so a run whose log is thrown away the
moment it ends cannot be debugged after the fact. Each run's full log is reachable from the record
kept under the case it covered (R8).

*Narrowed 2026-07-30: R6 previously also required a screen-level "recent runs" list that disambiguated
what each run covered (the screen, or the one case a scoped run named). Removed at the human's
direction — every case already keeps its own last-ten-run history under the test (R8), each stamped
with time, duration and commit, so the coarser cross-run list was redundant and only cluttered the
tests column. A run's log and its scope now live in the per-case record, nowhere else.*

## R7 — The panel stays open when the job ends

Finishing does not close the panel or reload the page out from under it. The log and the result stay
on screen until you dismiss them, so the output is there to read for reference. There is no
"background" that hides a running job behind a chip: a job runs in the open or is cancelled.

*Corrected 2026-07-28: "Run in background" was removed. It hid a live job behind a header chip on the
theory that a visible chip stops a double-start — but R4 already refuses a second job on the server,
so the chip bought nothing, and a running job you could not read was more misleading than one you
could. Keeping the panel open is what "keep it visible" was always meant to buy.*

## R8 — A test run records each case on its own

Running a screen's suite records every test case individually — its result, its duration, its steps
and its own log — never one pass/fail folded over the whole file. Each case keeps its OWN most recent
record and shows it under that case, and every case can always expand its steps, so "which one
failed, and what did it actually say" is answerable without running it again.

Records **fold across runs, they never replace**. A run filtered to one test describes only that
test, so reading every case's record out of the newest run blanks the steps and the log of every
case that run did not include. Each case's record is the newest run that actually covered *that
case*.

A case keeps its **last ten runs**, not just the newest, each headed with when it ran, how long it
took and the commit it ran against. One run says whether it passes today; ten say whether it has
been flaky, when it started failing, and which commit changed it — which is the question you
actually have when a test goes red.

Evidence must be real evidence. A screenshot of a page that was never driven proves nothing, and a
picture that no longer exists is worse than no picture: both read as "here is what the test saw"
while showing nothing. Neither is displayed.

*Corrected 2026-07-28: this said each case keeps its record "from the latest run", which is what got
built and is wrong — running a single test left that one case with steps and stripped every other
case on the screen down to nothing. It is the same trap as the results index, where a scoped run
must fold rather than replace, and it needed saying here too.*
