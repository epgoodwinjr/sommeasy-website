import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

interface GroupResult {
  passed: number;
  failed: number;
  skipped: number;
  failures: { title: string; error: string }[];
}

class SummaryReporter implements Reporter {
  private groups: Map<string, GroupResult> = new Map();

  onTestEnd(test: TestCase, result: TestResult) {
    // Get the top-level describe group
    const group = test.parent?.title || "Ungrouped";

    if (!this.groups.has(group)) {
      this.groups.set(group, { passed: 0, failed: 0, skipped: 0, failures: [] });
    }
    const g = this.groups.get(group)!;

    if (result.status === "passed") {
      g.passed++;
    } else if (result.status === "skipped") {
      g.skipped++;
    } else {
      g.failed++;
      const errorMsg = result.errors?.[0]?.message?.split("\n")[0] || "Unknown error";
      g.failures.push({ title: test.title, error: errorMsg });
    }
  }

  onEnd(result: FullResult) {
    let totalPassed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    const allFailures: { group: string; title: string; error: string }[] = [];

    console.log("\n");
    console.log("SOMMEASY SMOKE TEST RESULTS");
    console.log("============================");

    for (const [group, g] of this.groups) {
      totalPassed += g.passed;
      totalFailed += g.failed;
      totalSkipped += g.skipped;

      const total = g.passed + g.failed;
      const icon = g.failed === 0 ? "\u2705" : "\u274C";
      const skippedNote = g.skipped > 0 ? ` (${g.skipped} skipped)` : "";
      console.log(`${icon} ${group}: ${g.passed}/${total} passed${skippedNote}`);

      for (const f of g.failures) {
        allFailures.push({ group, ...f });
      }
    }

    const totalTests = totalPassed + totalFailed;
    console.log("---");
    console.log(`TOTAL: ${totalPassed}/${totalTests} passed${totalSkipped > 0 ? ` (${totalSkipped} skipped)` : ""}`);

    if (allFailures.length > 0) {
      console.log("\nFAILURES:");
      for (const f of allFailures) {
        console.log(`- ${f.group} > "${f.title}" \u2014 ${f.error}`);
      }
    }

    console.log("");
  }
}

export default SummaryReporter;
