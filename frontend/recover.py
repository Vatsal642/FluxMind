import json
import sys

transcript_path = "/Users/vatsalsomvanshi/.gemini/antigravity/brain/921260a0-64f3-41fa-bb28-81bdb099b4f1/.system_generated/logs/transcript_full.jsonl"

found_page = None
found_layout = None

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
                        content = args.get("CodeContent", "")
                        
                        if "page.tsx" in target:
                            found_page = content
                        if "layout.tsx" in target:
                            found_layout = content
        except Exception:
            pass

if found_page:
    with open("src/app/page.tsx", "w") as f:
        f.write(found_page)
    print("Recovered page.tsx!")
else:
    print("Could not find page.tsx in transcript.")

if found_layout:
    with open("src/app/layout.tsx", "w") as f:
        f.write(found_layout)
    print("Recovered layout.tsx!")
else:
    print("Could not find layout.tsx in transcript.")
