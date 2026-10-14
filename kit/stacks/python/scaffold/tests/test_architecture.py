"""Test architektury: granice modułów (rozstrzygający; import-linter to obrona w głąb).

1) moduł importuje inny moduł tylko przez jego pakiet (``pkg.modules.b``),
   nie przez wnętrze (``pkg.modules.b.repo``),
2) ``pkg.platform`` nie importuje ``pkg.modules``. Ma kontrolę samego siebie.
Ograniczenie: ``from pkg.modules.b import repo`` (podmoduł przez pakiet) nie jest wykrywane.
"""
from __future__ import annotations

import ast
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src"
PKG = next(p.name for p in SRC.iterdir() if (p / "__init__.py").exists())


def imports(code: str, module: str) -> list[str]:
    out: list[str] = []
    for node in ast.walk(ast.parse(code)):
        if isinstance(node, ast.Import):
            out += [a.name for a in node.names]
        elif isinstance(node, ast.ImportFrom):
            base = node.module or ""
            if node.level:
                parts = module.split(".")[: -node.level]
                base = ".".join(parts + ([base] if base else []))
            out += [f"{base}.{a.name}" if a.name != "*" else base for a in node.names] if base else []
    return out


def violation(src_module: str, target: str, pkg: str = PKG) -> str | None:
    mods = f"{pkg}.modules."
    if src_module.startswith(f"{pkg}.platform") and target.startswith(mods):
        return "platforma importuje moduł"
    if src_module.startswith(mods) and target.startswith(mods):
        own, other = src_module[len(mods):].split(".")[0], target[len(mods):].split(".")
        if other[0] != own and len(other) > 2:  # pkg.modules.b.repo.X → wnętrze; pkg.modules.b.X → interfejs
            return f"moduł {own} importuje wnętrze modułu {other[0]}"
    return None


def test_reguly_wykrywaja_naruszenia() -> None:
    assert violation("p.modules.a.service", "p.modules.b.repo.save", "p")
    assert violation("p.modules.a.service", "p.modules.b.create_note", "p") is None
    assert violation("p.modules.a.service", "p.modules.a.repo.save", "p") is None
    assert violation("p.platform.http", "p.modules.a.x", "p")
    assert imports("from ..b.repo import save", "p.modules.a.service") == ["p.modules.b.repo.save"]


def test_granice_modulow() -> None:
    bad = []
    for f in (SRC / PKG).rglob("*.py"):
        module = ".".join(f.relative_to(SRC).with_suffix("").parts).removesuffix(".__init__")
        for target in imports(f.read_text(encoding="utf-8"), module):
            v = violation(module, target)
            if v:
                bad.append(f"{f.relative_to(SRC)}: {v}")
    assert bad == []
