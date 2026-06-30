import json

transcript_path = "/Users/vatsalsomvanshi/.gemini/antigravity/brain/921260a0-64f3-41fa-bb28-81bdb099b4f1/.system_generated/logs/transcript_full.jsonl"

# We want to reverse all multi_replace_file_content calls made in this session.
# Since we might have made multiple replacements on the same file in order,
# we need to apply the reverse operations in REVERSE chronological order!

calls_to_reverse = []

with open(transcript_path, "r") as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get("type") == "PLANNER_RESPONSE":
                tool_calls = data.get("tool_calls", [])
                for call in tool_calls:
                    if call.get("toolName") == "multi_replace_file_content":
                        args = call.get("args", {})
                        target = args.get("TargetFile", "")
                        chunks = args.get("ReplacementChunks", [])
                        calls_to_reverse.append((target, chunks))
        except Exception:
            pass

print(f"Found {len(calls_to_reverse)} replace calls to reverse.")

# Reverse the list to undo the most recent changes first
calls_to_reverse.reverse()

for target, chunks in calls_to_reverse:
    print(f"Reversing changes for {target}")
    try:
        with open(target, "r") as f:
            content = f.read()
            
        # We need to swap ReplacementContent with TargetContent
        for chunk in chunks:
            old_str = chunk.get("TargetContent", "")
            new_str = chunk.get("ReplacementContent", "")
            
            # Since we are reversing, new_str is what's currently in the file,
            # and old_str is what we want to put back.
            if new_str in content:
                content = content.replace(new_str, old_str)
            else:
                print(f"WARNING: Could not find '{new_str[:30]}...' in {target}")
                
        with open(target, "w") as f:
            f.write(content)
            
    except Exception as e:
        print(f"Error processing {target}: {e}")
