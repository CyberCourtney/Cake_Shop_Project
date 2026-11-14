"""Tiny SVG kit that reproduces the workout-app diagram style: dark navy card,
soft corner glows, rounded node tiles with a coloured icon square, numbered
step badges and a footer legend."""
from xml.sax.saxutils import escape as _esc

def esc(s): return _esc(str(s), {'"': "&quot;"})

C = {  # accents
    "sky": "#2EC5FF", "violet": "#9D8FFF", "coral": "#FF6B6B", "mango": "#FFB547",
    "lime": "#B8F23A", "grey": "#7C7FA8", "mist": "#A9ABD0", "purple": "#6C5CE7",
}
NAVY = "#0F1024"; NODE = "#1B1C42"

ICONS = {
 "globe": '<g fill="none" stroke="#0F1024" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></g>',
 "bucket": '<g fill="none" stroke="#0F1024" stroke-width="2" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="8" ry="2.6"/><path d="M4 6l2 13c.3 1.4 2.9 2.4 6 2.4s5.7-1 6-2.4L20 6"/></g>',
 "user": '<g fill="none" stroke="#0F1024" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6"/></g>',
 "api": '<g fill="none" stroke="#0F1024" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4c-2 0-3 1-3 3v2c0 1.5-1 3-2 3 1 0 2 1.5 2 3v2c0 2 1 3 3 3"/><path d="M16 4c2 0 3 1 3 3v2c0 1.5 1 3 2 3-1 0-2 1.5-2 3v2c0 2-1 3-3 3"/></g>',
 "lambda": '<path d="M5 21l6-11-3-6H5V3h4.5l9 16.5H21V21h-3.5L13 12.5 8.3 21z" fill="#0F1024"/>',
 "db": '<g fill="none" stroke="#0F1024" stroke-width="2"><ellipse cx="12" cy="5.5" rx="8" ry="2.8"/><path d="M4 5.5v13c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8v-13"/><path d="M4 12c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8"/></g>',
 "chart": '<g fill="none" stroke="#0F1024" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></g>',
 "lock": '<g fill="none" stroke="#0F1024" stroke-width="2" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></g><circle cx="12" cy="15.5" r="1.6" fill="#0F1024"/>',
 "mail": '<g fill="none" stroke="#0F1024" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 6.5l8.5 7 8.5-7"/></g>',
 "bell": '<g fill="none" stroke="#0F1024" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></g>',
 "queue": '<g fill="none" stroke="#0F1024" stroke-width="2" stroke-linejoin="round"><rect x="4" y="4" width="16" height="4.5" rx="1.5"/><rect x="4" y="10" width="16" height="4.5" rx="1.5"/><rect x="4" y="16" width="16" height="4.5" rx="1.5"/></g>',
 "coin": '<g fill="none" stroke="#0F1024" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M14.5 8.5c-.6-.9-1.5-1.3-2.5-1.3-1.6 0-2.7.9-2.7 2.1 0 2.9 5.6 1.6 5.6 4.6 0 1.3-1.2 2.2-2.9 2.2-1.1 0-2.1-.5-2.7-1.4M12 5.5v1.7M12 16.8v1.7"/></g>',
 "sign": '<g fill="none" stroke="#0F1024" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M12 3v18"/><path d="M5 6h11l3 2.5-3 2.5H5z"/><path d="M19 13H8l-3 2.5L8 18h11z"/></g>',
 "phone": '<g fill="none" stroke="#0F1024" stroke-width="2" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 18.5h3" stroke-linecap="round"/></g>',
 "laptop": '<g fill="none" stroke="#0F1024" stroke-width="2" stroke-linejoin="round"><rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M2.5 19h19l-2-4h-15z"/></g>',
 "sheet": '<g fill="none" stroke="#0F1024" stroke-width="2" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/></g>',
 "layers": '<g fill="none" stroke="#0F1024" stroke-width="2" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></g>',
 "box": '<g fill="none" stroke="#0F1024" stroke-width="2" stroke-linejoin="round"><path d="M3 7.5l9-4.5 9 4.5v9l-9 4.5-9-4.5z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/></g>',
 "check": '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#0F1024" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
 "cake": '<g fill="none" stroke="#0F1024" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M4 21h16M5 21v-7h14v7"/><path d="M5 17c2 1.5 3.5 1.5 4.7 0s2.6-1.5 4.6 0 3.5 1.5 4.7 0"/><path d="M12 14V9"/><path d="M12 6.5c-1-1.2-1-2.4 0-3.5 1 1.1 1 2.3 0 3.5z"/></g>',
 "shield": '<g fill="none" stroke="#0F1024" stroke-width="2" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5" stroke-linecap="round"/></g>',
 "flag": '<g fill="none" stroke="#0F1024" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/></g>',
 "search": '<g fill="none" stroke="#0F1024" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></g>',
}

STYLE = """
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    .h1 { font-size: 30px; font-weight: 800; fill: #FFFFFF; letter-spacing: -0.5px; }
    .h2 { font-size: 15px; fill: #A9ABD0; }
    .nt { font-size: 16px; font-weight: 700; fill: #FFFFFF; }
    .ns { font-size: 12px; fill: #A9ABD0; }
    .zone { font-size: 12px; font-weight: 700; letter-spacing: 1.2px; fill: #A9ABD0; }
    .lbl { font-size: 12px; font-weight: 600; }
    .step { font-size: 12px; font-weight: 800; fill: #0F1024; }
    .node { fill: #1B1C42; stroke-width: 1.5; }
"""


class Svg:
    def __init__(self, w, h, title, desc, heading, sub):
        self.w, self.h = w, h
        self.title, self.desc, self.heading, self.sub = title, desc, heading, sub
        self.parts = []

    def add(self, s): self.parts.append(s); return self

    # ---- primitives ------------------------------------------------------
    def node(self, x, y, color, icon, title, lines=(), w=200, h=84, tile=None):
        c = C.get(color, color); t = C.get(tile, tile) if tile else c
        out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" class="node" stroke="{c}"/>']
        ty = y + (h - 44) / 2
        out.append(f'<rect x="{x+14}" y="{ty}" width="44" height="44" rx="12" fill="{t}"/>'
                   f'<use href="#i-{icon}" x="{x+24}" y="{ty+10}" width="24" height="24"/>')
        n = len(lines)
        top = y + h / 2 - (n * 16) / 2 + (2 if n else 6)
        out.append(f'<text x="{x+70}" y="{top}" class="nt">{esc(title)}</text>')
        for i, l in enumerate(lines):
            out.append(f'<text x="{x+70}" y="{top+19+i*16}" class="ns">{esc(l)}</text>')
        return self.add("\n  ".join(out))

    def pill(self, x, y, color, icon, title, line="", w=200):
        c = C.get(color, color)
        return self.add(
            f'<rect x="{x}" y="{y}" width="{w}" height="56" rx="14" class="node" stroke="{c}"/>'
            f'<rect x="{x+12}" y="{y+10}" width="36" height="36" rx="10" fill="{c}"/>'
            f'<use href="#i-{icon}" x="{x+18}" y="{y+16}" width="24" height="24"/>'
            f'<text x="{x+60}" y="{y+24 if line else y+33}" class="lbl" fill="#FFFFFF">{esc(title)}</text>'
            + (f'<text x="{x+60}" y="{y+42}" class="ns">{esc(line)}</text>' if line else ""))

    def zone(self, x, y, w, h, label, color="purple", fill_op=0.025):
        c = C.get(color, color)
        return self.add(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="22" fill="#FFFFFF" fill-opacity="{fill_op}" '
            f'stroke="{c}" stroke-opacity="0.6" stroke-width="1.5" stroke-dasharray="2 0"/>'
            f'<text x="{x+20}" y="{y+26}" class="zone">{esc(label.upper())}</text>')

    def path(self, d, color, width=2, dashed=False, dots=False, head=True):
        c = C.get(color, color); key = color if color in C else "grey"
        dash = ' stroke-dasharray="6 5"' if dashed else (' stroke-dasharray="3 4"' if dots else "")
        mk = f' marker-end="url(#a-{key})"' if head else ""
        return self.add(f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{width}"{dash}{mk}/>')

    def badge(self, cx, cy, n, color):
        return self.add(f'<circle cx="{cx}" cy="{cy}" r="13" fill="{C.get(color, color)}"/>'
                        f'<text x="{cx}" y="{cy+4.5}" text-anchor="middle" class="step">{n}</text>')

    def label(self, x, y, text, color, sub=None, anchor="start", bg=False):
        c = C.get(color, color); a = f' text-anchor="{anchor}"' if anchor != "start" else ""
        out = ""
        if bg:
            wpx = len(text) * 7 + 22
            bx = x - wpx / 2 if anchor == "middle" else (x - wpx + 11 if anchor == "end" else x - 11)
            out += f'<rect x="{bx}" y="{y-15}" width="{wpx}" height="22" rx="11" fill="#14153A"/>'
        out += f'<text x="{x}" y="{y}"{a} class="lbl" fill="{c}">{esc(text)}</text>'
        if sub:
            out += f'<text x="{x}" y="{y+16}"{a} class="ns">{esc(sub)}</text>'
        return self.add(out)

    def note(self, x, y, title, color, lines):
        out = [f'<text x="{x}" y="{y}" class="lbl" fill="{C.get(color, color)}">{esc(title)}</text>']
        for i, l in enumerate(lines):
            out.append(f'<text x="{x}" y="{y+22+i*16}" class="ns">{esc(l)}</text>')
        return self.add("".join(out))

    def legend(self, x, y, items, dashed=None):
        out = [f'<g transform="translate({x} {y})">']; cx = 0
        for color, text in items:
            out.append(f'<circle cx="{cx+8}" cy="0" r="6" fill="{C.get(color, color)}"/>'
                       f'<text x="{cx+22}" y="4.5" class="ns">{esc(text)}</text>')
            cx += 22 + len(text) * 6.6 + 28
        if dashed:
            out.append(f'<path d="M{cx} 0 h30" stroke="#A9ABD0" stroke-width="1.5" stroke-dasharray="6 5"/>'
                       f'<text x="{cx+40}" y="4.5" class="ns">{esc(dashed)}</text>')
        out.append("</g>")
        return self.add("".join(out))

    # ---- output ----------------------------------------------------------
    def render(self):
        markers = "\n    ".join(
            f'<marker id="a-{k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
            f'orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="{v}"/></marker>' for k, v in C.items())
        icons = "\n    ".join(f'<symbol id="i-{k}" viewBox="0 0 24 24">{v}</symbol>' for k, v in ICONS.items())
        w, h = self.w, self.h
        return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-labelledby="t d">
  <title id="t">{esc(self.title)}</title>
  <desc id="d">{esc(self.desc)}</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14153A"/><stop offset="1" stop-color="#0F1024"/></linearGradient>
    <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6C5CE7"/><stop offset="1" stop-color="#FF6B6B"/></linearGradient>
    <radialGradient id="glow1" cx="0.85" cy="0.1" r="0.5"><stop offset="0" stop-color="#6C5CE7" stop-opacity="0.28"/><stop offset="1" stop-color="#6C5CE7" stop-opacity="0"/></radialGradient>
    <radialGradient id="glow2" cx="0.05" cy="0.95" r="0.45"><stop offset="0" stop-color="#FF6B6B" stop-opacity="0.18"/><stop offset="1" stop-color="#FF6B6B" stop-opacity="0"/></radialGradient>
    {markers}
    {icons}
  </defs>
  <style>{STYLE}  </style>
  <rect width="{w}" height="{h}" rx="28" fill="url(#bg)"/>
  <rect width="{w}" height="{h}" rx="28" fill="url(#glow1)"/>
  <rect width="{w}" height="{h}" rx="28" fill="url(#glow2)"/>
  <rect x="56" y="38" width="44" height="6" rx="3" fill="#6C5CE7"/>
  <text x="56" y="80" class="h1">{esc(self.heading)}</text>
  <text x="56" y="108" class="h2">{esc(self.sub)}</text>
  {chr(10).join("  " + p for p in self.parts)}
</svg>
'''

    def device(self, x, y, w, h, icon_path, title, sub, bars, foot=None):
        """A phone/laptop 'hero' card like the workout diagram's phone."""
        out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="30" fill="#1B1C42" stroke="url(#hero)" stroke-width="3"/>',
               f'<rect x="{x+w/2-30}" y="{y+14}" width="60" height="8" rx="4" fill="#0F1024"/>',
               f'<rect x="{x+w/2-30}" y="{y+40}" width="60" height="60" rx="16" fill="url(#hero)"/>',
               f'<use href="#i-{icon_path}" x="{x+w/2-18}" y="{y+52}" width="36" height="36" style="color:#fff"/>',
               f'<text x="{x+w/2}" y="{y+130}" text-anchor="middle" class="nt">{esc(title)}</text>',
               f'<text x="{x+w/2}" y="{y+150}" text-anchor="middle" class="ns">{esc(sub)}</text>']
        for i, (color, bw) in enumerate(bars):
            out.append(f'<rect x="{x+24}" y="{y+170+i*18}" width="{bw}" height="10" rx="5" fill="{C[color]}" fill-opacity="0.8"/>')
        if foot:
            out.append(f'<text x="{x+w/2}" y="{y+h-18}" text-anchor="middle" class="ns">{esc(foot)}</text>')
        return self.add("".join(out))


def sequence(fname, title, desc, heading, sub, parts, msgs, legend=None, width=None, notes=None):
    """Render a sequence diagram in the same style.
    parts: [(key, name, sub, color, icon)]
    msgs:  dicts with keys: a, b, text, sub?, color, kind ('req' | 'reply' | 'self' | 'note' | 'group'),
           for 'group': text, color, rows (number of following rows it spans)."""
    n = len(parts)
    colw = 230 if width is None else (width - 112) / n
    W = width or int(112 + colw * n)
    top = 150; tile_h = 84; row = 54
    rows = [m for m in msgs if m["kind"] != "group"]
    H = int(top + tile_h + 40 + len(rows) * row + 90 + 42 * sum(1 for m in msgs if m["kind"] == "group"))
    s = Svg(W, H, title, desc, heading, sub)
    xs = {}
    for i, (k, name, psub, color, icon) in enumerate(parts):
        cx = 56 + colw * i + colw / 2
        xs[k] = cx
        s.path(f"M{cx} {top+tile_h} V{H-80}", "grey", width=1.5, dots=True, head=False)
        s.node(cx - 100, top, color, icon, name, psub if isinstance(psub, (list, tuple)) else [psub])
    y = top + tile_h + 50
    step = 0
    pending_groups = []
    group_left = 0
    for m in msgs:
        if m["kind"] == "group":
            if group_left > 0: y += 10
            y += 18; pending_groups.append((y, m)); group_left = m["rows"]; continue
        color = m.get("color", "sky"); c = C[color]
        if m["kind"] == "note":
            x1 = xs[m["a"]]; x2 = xs.get(m.get("b", m["a"]), x1)
            need = max(len(m["text"]), len(m.get("sub") or "")) * 7 + 40
            lo, hi = min(x1, x2) - 95, max(x1, x2) + 95
            if hi - lo < need:
                mid0 = (lo + hi) / 2; lo, hi = mid0 - need / 2, mid0 + need / 2
            if lo < 56: hi += 56 - lo; lo = 56
            if hi > W - 56: lo -= hi - (W - 56); hi = W - 56
            s.add(f'<rect x="{lo}" y="{y-26}" width="{hi-lo}" height="{40 if not m.get("sub") else 46}" rx="12" fill="#17183F"/>')
            s.add(f'<rect x="{lo}" y="{y-26}" width="{hi-lo}" height="{40 if not m.get("sub") else 46}" rx="12" fill="{c}" fill-opacity="0.12" stroke="{c}" stroke-opacity="0.5"/>')
            s.label((lo + hi) / 2, y - 8, m["text"], color, m.get("sub"), anchor="middle")
            y += row
            if group_left > 0:
                group_left -= 1
                if group_left == 0: y += 14
            continue
        step += 1
        if m["kind"] == "self":
            x = xs[m["a"]]
            s.path(f"M{x} {y-6} h36 v18 h-32", color, width=2)
            s.badge(x - 22, y + 3, step, color)
            s.label(x + 52, y + 1, m["text"], color, m.get("sub"), bg=True)
        else:
            x1, x2 = xs[m["a"]], xs[m["b"]]
            d = 1 if x2 > x1 else -1
            s.path(f"M{x1 + d*4} {y} H{x2 - d*8}", color, width=2, dashed=(m["kind"] == "reply"))
            mid = (x1 + x2) / 2
            s.badge(x1 - d * 22, y, step, color)
            s.label(mid + d * 8, y - 10, m["text"], color, None, anchor="middle", bg=True)
            if m.get("sub"):
                s.add(f'<text x="{mid + d*8}" y="{y+18}" text-anchor="middle" class="ns">{esc(m["sub"])}</text>')
        y += row
        if group_left > 0:
            group_left -= 1
            if group_left == 0: y += 14
    for gy, g in pending_groups:
        c = C[g["color"]]
        gh = g["rows"] * row
        s.parts.insert(0, f'<rect x="40" y="{gy-34}" width="{W-80}" height="{gh+6}" rx="16" fill="{c}" fill-opacity="0.05" stroke="{c}" stroke-opacity="0.45" stroke-dasharray="6 5"/>'
                          f'<text x="{W-60}" y="{gy-14}" text-anchor="end" class="zone" fill="{c}" style="fill:{c}">{esc(g["text"].upper())}</text>')
    if legend:
        s.legend(56, H - 40, legend, dashed="reply")
    open(fname, "w").write(s.render())
    return s
