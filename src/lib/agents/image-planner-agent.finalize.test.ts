import { describe, expect, it } from "vitest";
import { finalizeImagePlanTask, ImagePlanTaskSchema } from "./image-planner-agent";

describe("finalizeImagePlanTask", () => {
  it("compiles a visualBrief into a visual-only prompt and keeps copy out", () => {
    const task = finalizeImagePlanTask(
      {
        pageId: "p1",
        nodeId: "n1",
        imagePrompt: "",
        width: 1440,
        height: 900,
        role: "hero",
        copyPlan: [{ id: "headline", role: "headline", text: "Welcome back" }],
        visualBrief: {
          category: "ui",
          subject: "Premium SaaS login screen",
          visualAnchors: {
            lighting: "soft directional daylight",
            materials: ["warm off-white paper", "frosted glass"],
            palette: ["warm off-white", "muted cobalt"],
            composition: "centered with generous negative space",
            camera: "35mm",
            mood: ["calm", "expensive"],
          },
          textPolicy: "overlay",
          referenceIds: [],
          aspectRatio: "16:9",
          mustKeep: [],
          mustAvoid: [],
        },
      },
      "ui",
    );

    expect(task.imagePrompt).toContain("Premium SaaS login screen");
    expect(task.imagePrompt).toContain("empty space for text overlay");
    expect(task.imagePrompt).not.toContain("Welcome back");
    expect(task.imagePrompt).not.toContain("Render this UI text");
    expect(task.copyPlan).toEqual([{ id: "headline", role: "headline", text: "Welcome back" }]);
    expect(task.promptAudit?.ok).toBe(true);
    expect(task.promptCandidates?.length).toBeGreaterThan(1);
    expect(task.promptCandidates?.[0]).toBe(task.imagePrompt);
  });

  it("fills imagePrompt from visualBrief when the LLM omits it", () => {
    const parsed = ImagePlanTaskSchema.parse({
      pageId: "p1",
      nodeId: "n1",
      width: 1440,
      height: 900,
      role: "hero",
      visualBrief: {
        category: "ui",
        subject: "Premium SaaS login screen",
        visualAnchors: {
          lighting: "soft directional daylight",
          materials: ["warm off-white paper"],
          palette: ["muted cobalt"],
          composition: "centered with generous negative space",
          mood: ["calm"],
        },
      },
    });

    expect(parsed.imagePrompt).toBe("");
    const task = finalizeImagePlanTask(parsed, "ui");
    expect(task.imagePrompt).toContain("Premium SaaS login screen");
    expect(task.promptAudit?.ok).toBe(true);
  });

  it("lints a legacy free-string prompt without rewriting it", () => {
    const legacy = "A modern clean professional SaaS login page with a button, 8k";
    const task = finalizeImagePlanTask(
      {
        pageId: "p1",
        nodeId: "n1",
        imagePrompt: legacy,
        width: 1440,
        height: 900,
        role: "hero",
      },
      "ui",
    );

    expect(task.imagePrompt).toBe(legacy);
    expect(task.promptAudit?.issues.some((issue) => issue.code === "layout-or-copy")).toBe(true);
    expect(task.promptAudit?.issues.some((issue) => issue.code === "generic-language")).toBe(true);
  });
});
