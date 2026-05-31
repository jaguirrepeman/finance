import re
import json

with open("puglia-guide-ruta-e.html", "r", encoding="utf-8") as f:
    content = f.read()

css_match = re.search(r':root\s*\{([^\}]+)\}', content)
css = css_match.group(1) if css_match else ""

days = re.findall(r'<div class="day-card" id="dia-\d+">.*?<h2[^>]*>(.*?)</h2>', content, re.DOTALL)

with open("guide_outline.json", "w", encoding="utf-8") as f:
    json.dump({"css": css, "days": days}, f, indent=2)
