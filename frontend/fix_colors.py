import os

base_dir = "/Users/vatsalsomvanshi/Downloads/FluxMind/frontend/src/components"
for f in os.listdir(base_dir):
    if not f.endswith(".tsx"): continue
    path = os.path.join(base_dir, f)
    with open(path, "r") as file:
        content = file.read()
    
    # Replace the dark mode hardcoded slate colors back to neon glassmorphism tailwind
    replacements = [
        ("bg-slate-800", "bg-white/5"),
        ("bg-slate-800/50", "bg-white/5"),
        ("bg-slate-800/30", "bg-white/5"),
        ("bg-slate-900", "bg-black/40"),
        ("bg-slate-900/95", "bg-[#0a0a0f]/95"),
        ("border-slate-700", "border-white/10"),
        ("border-slate-700/50", "border-white/10"),
        ("border-slate-800", "border-white/10"),
        ("text-slate-50", "text-white"),
        ("text-slate-400", "text-white/60"),
        ("text-slate-500", "text-white/40"),
        ("hover:bg-slate-700", "hover:bg-white/10"),
        ("hover:text-slate-50", "hover:text-white"),
    ]
    
    for old, new in replacements:
        content = content.replace(old, new)
        
    with open(path, "w") as file:
        file.write(content)

print("Reverted all component colors to neon glassmorphism.")
