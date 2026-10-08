/**
 * `/jobs` in a focused subagent view lists the focused agent's jobs (issue #14814).
 *
 * Failure mode if this regresses: switching to a subagent that is running a
 * job and typing `/jobs` shows nothing — the command reads the main session's
 * job snapshot, whose owner filter excludes the subagent's jobs, so the user
 * sees an empty list instead of the running job.
 */
import { afterEach, describe, expect, it, vi } from "bun:test";
import { CommandController } from "@oh-my-pi/pi-coding-agent/modes/controllers/command-controller";
import type { InteractiveModeContext } from "@oh-my-pi/pi-coding-agent/modes/types";
import type { AsyncJobSnapshot } from "@oh-my-pi/pi-coding-agent/session/agent-session-types";
import type { Text } from "@oh-my-pi/pi-tui/components/text";

function emptySnapshot(): AsyncJobSnapshot {
	return { running: [], recent: [], delivery: { queued: 0, delivering: false, pendingJobIds: [] } };
}

function snapshotWithJob(label: string): AsyncJobSnapshot {
	return {
		...emptySnapshot(),
		running: [
			{
				id: "job-1",
				type: "bash",
				status: "running",
				label,
				startTime: Date.now() - 60_000,
				agentId: "worker",
			},
		],
	};
}

function createController(viewSnapshot: AsyncJobSnapshot) {
	const mainGetSnapshot = vi.fn(() => emptySnapshot());
	const viewGetSnapshot = vi.fn(() => viewSnapshot);
	const ctx = {
		session: { getAsyncJobSnapshot: mainGetSnapshot },
		viewSession: { getAsyncJobSnapshot: viewGetSnapshot },
		focusedAgentId: "worker",
		ui: { terminal: { columns: 100 } },
	} as unknown as InteractiveModeContext;
	const controller = new CommandController(ctx);
	const reports: Array<{ title: string; body: Text }> = [];
	vi.spyOn(controller, "showCommandReport").mockImplementation(options => {
		reports.push({ title: options.title, body: options.body as Text });
	});
	return { controller, reports, mainGetSnapshot, viewGetSnapshot };
}

describe("/jobs in a focused subagent view", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("lists the focused agent's jobs, not the main session's", async () => {
		const { controller, reports, mainGetSnapshot, viewGetSnapshot } = createController(
			snapshotWithJob("subagent long build"),
		);

		await controller.handleJobsCommand();

		expect(viewGetSnapshot).toHaveBeenCalledTimes(1);
		expect(mainGetSnapshot).not.toHaveBeenCalled();
		expect(reports).toHaveLength(1);
		expect(reports[0]?.title).toBe("Background Jobs");
		expect(reports[0]?.body.getText()).toContain("subagent long build");
	});

	it("reports the focused agent's empty state when it has no jobs", async () => {
		const { controller, reports } = createController(emptySnapshot());

		await controller.handleJobsCommand();

		expect(reports).toHaveLength(1);
		expect(reports[0]?.body.getText()).toContain("No async jobs yet.");
	});
});
