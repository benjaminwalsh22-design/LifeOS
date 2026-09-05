// deno test tests/
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { formatOk, verifyQuotes, parseSources, pickRules } from "../supabase/functions/ask-ben/index.ts";

Deno.test("voice and tool rules select per request", () => {
  assert(pickRules("both", "deep").voice.includes("both voices"));
  assert(pickRules("past", "deep").voice.includes("ONLY as Past Ben"));
  assert(pickRules("future", "quick").voice.includes("ONLY as Future Ben"));
  assert(pickRules("future", "quick").tool.includes("search is off"));
  assert(pickRules("both", "deep").tool.includes("search_journal"));
  // unknown values fall back rather than throw
  assertEquals(pickRules("nonsense", "nonsense"), pickRules("both", "deep"));
});

Deno.test("citation parser extracts date, label and entry id", () => {
  const md = `## From the record\nstuff\n## Sources\n- 2021-12-27 · the sleep fight · entry:82kcxkozmsv9tv88\n- 2019-03-04 · Reagan's first tantrum · entry:4UVRE5M3MTEKMM44\n* 2016-04-09 · a loop starts · entry:abc123def456\n- not a citation line\n`;
  const s = parseSources(md);
  assertEquals(s.length, 3);
  assertEquals(s[0], { date: "2021-12-27", label: "the sleep fight", entry_id: "82kcxkozmsv9tv88" });
  assertEquals(s[1].entry_id, "4uvre5m3mtekmm44");        // normalised to lower case
  assertEquals(s[2].label, "a loop starts");
});

Deno.test("citation parser tolerates a missing link", () => {
  const s = parseSources("## Sources\n- 2020-11-11 · record income, burnout\n");
  assertEquals(s.length, 1);
  assertEquals(s[0].entry_id, null);
});

Deno.test("quotes that were given pass; invented ones are marked", () => {
  const allowed = [
    "I think 95% of it is because of the lack of sleep and 5% was because married people fight. It's inevitable.",
    "Literally as I was just gonna go get her 3 baby goats come out of NO where!",
  ];
  const md = [
    "## From the record",
    "> I think 95% of it is because of the lack of sleep and 5% was because married people fight. (2021-12-27)",
    "> 3 baby goats come out of NO where! (2015-08-06)",
    "> You wrote that everything would be fine if you just tried harder and slept less. (2019-01-01)",
    "plain text stays plain",
  ].join("\n");
  const r = verifyQuotes(md, allowed);
  assertEquals(r.unverified, 1);
  assert(r.markdown.includes("> I think 95%"));                                   // exact, passes
  assert(r.markdown.includes("> 3 baby goats"));                                   // fragment, passes
  assert(r.markdown.includes("tried harder and slept less. (2019-01-01) *(unverified"));
  assert(!r.markdown.includes("> You wrote that everything"));                     // no longer a blockquote
});

Deno.test("quote check is tolerant of curly quotes and spacing", () => {
  const allowed = ["It's inevitable. Married people fight."];
  const r = verifyQuotes("> It’s inevitable.  Married  people fight. (2021-12-27)", allowed);
  assertEquals(r.unverified, 0);
});

import { trimPreamble } from "../supabase/functions/ask-ben/index.ts";
Deno.test("preamble before the first heading is removed, glued headings are separated", () => {
  const md = "I'm going to pull your playbook for this one.## From the record\n\nStop.\n## Sources\n- x";
  const out = trimPreamble(md);
  assert(out.startsWith("## From the record"));
  assert(out.includes("\n## Sources"));
  assertEquals(trimPreamble("## From the record\nfine"), "## From the record\nfine");
});

Deno.test("inline quotes in prose are checked too", () => {
  const allowed = ["resolving to be better about separating work and family without changing the calendar"];
  const md = 'You wrote in January 2022: "resolving to be better about separating work and family without changing the calendar" and it held.\n'
           + 'You also wrote "I will never work past eight again as long as I live" which is not in the record.\n'
           + 'A short "no" is fine.';
  const r = verifyQuotes(md, allowed);
  assertEquals(r.unverified, 1);
  assert(r.markdown.includes('as long as I live" *(unverified'));
  assert(!r.markdown.includes('changing the calendar" *(unverified'));
  assert(r.markdown.includes('A short "no" is fine.'));
});

Deno.test("suggested dialogue and echoed words are not treated as citations", () => {
  const r = verifyQuotes(
    'Tell Annalise not "I will be done Friday like I always say" but "I am stepping away at eight the rest of the week".\n'
  + 'I text the client "back at it in the morning, thanks for your patience tonight" and close the laptop.\n'
  + 'You wrote in 2022: "this line was never in the journal at all, not once" and moved on.', []);
  assertEquals(r.unverified, 1);
  assert(r.markdown.includes('not once" *(unverified'));
  assert(!r.markdown.includes('patience tonight" *(unverified'));
});

Deno.test("formatOk demands the headings the voice calls for", () => {
  const both = "## From the record\n\nx\n\n## From the Ben you're becoming\n\ny\n\n## Sources\n- 2024-01-12 · a · entry:abcdefghijkl";
  assertEquals(formatOk(both, "both"), true);
  assertEquals(formatOk(both, "past"), true);
  assertEquals(formatOk("## From the record\n\nx", "both"), false);
  assertEquals(formatOk("## From the record\n\nx", "past"), true);
  assertEquals(formatOk("## From the Ben you're becoming\n\ny", "future"), true);
  assertEquals(formatOk("I need to search your journal. Let me pull the entries.", "both"), false);
});
