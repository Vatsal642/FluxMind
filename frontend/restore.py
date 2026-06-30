import json

transcript_path = "/Users/vatsalsomvanshi/.gemini/antigravity/brain/921260a0-64f3-41fa-bb28-81bdb099b4f1/.system_generated/logs/transcript_full.jsonl"

components = [
    "BrainDump.tsx",
    "HabitsPanel.tsx",
    "MicroFocusHUD.tsx",
    "MissionLogs.tsx",
    "FluidTimeline.tsx",
    "ActionDeck.tsx"
]

restored = {}

with open(transcript_path, "r") as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get("type") == "PLANNER_RESPONSE":
                tool_calls = data.get("tool_calls", [])
                for call in tool_calls:
                    if call.get("toolName") == "write_to_file":
                        args = call.get("args", {})
                        target = args.get("TargetFile", "")
                        for comp in components:
                            if comp in target and comp not in restored:
                                content = args.get("CodeContent")
                                if content:
                                    restored[comp] = (target, content)
        except Exception as e:
            pass

for comp, (target, content) in restored.items():
    print(f"Restoring {comp} to {target}")
    with open(target, "w") as out:
        out.write(content)

print(f"Restored {len(restored)} components.")
