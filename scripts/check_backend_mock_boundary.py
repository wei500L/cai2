from __future__ import annotations

import ast
import sys
from dataclasses import dataclass
from pathlib import Path

APP_DIR = Path("app")
TESTS_DIR = APP_DIR / "tests"
ALLOWED_MOCK_MODULES = {"app.llm.mock_client"}
BANNED_TOKENS = ("mock", "fixture")


@dataclass(frozen=True)
class Violation:
    path: Path
    line: int
    module: str
    reason: str


def main() -> int:
    violations: list[Violation] = []
    for path in sorted(APP_DIR.rglob("*.py")):
        if _is_under(path, TESTS_DIR):
            continue
        violations.extend(_scan_file(path))

    if not violations:
        return 0

    print("Backend mock boundary violations:", file=sys.stderr)
    for violation in violations:
        print(
            f"{violation.path}:{violation.line}: {violation.reason}: {violation.module}",
            file=sys.stderr,
        )
    print(
        "\nProduction app code must not import modules whose path contains "
        "'mock' or 'fixture'. app/tests is exempt. app.llm.mock_client is the "
        "LLM provider implementation and is explicitly allowed.",
        file=sys.stderr,
    )
    return 1


def _scan_file(path: Path) -> list[Violation]:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    except SyntaxError as exc:
        return [
            Violation(
                path=path,
                line=exc.lineno or 1,
                module="<syntax error>",
                reason="cannot parse file during mock-boundary audit",
            )
        ]

    violations: list[Violation] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                module = alias.name
                reason = _banned_reason(module)
                if reason is not None:
                    violations.append(Violation(path, node.lineno, module, reason))
        elif isinstance(node, ast.ImportFrom):
            module = _resolve_import_from(path, node)
            candidates = [module]
            candidates.extend(f"{module}.{alias.name}" for alias in node.names if module)
            for candidate in candidates:
                reason = _banned_reason(candidate)
                if reason is not None:
                    violations.append(Violation(path, node.lineno, candidate, reason))
                    break
    return violations


def _resolve_import_from(path: Path, node: ast.ImportFrom) -> str:
    module = node.module or ""
    if node.level == 0:
        return module

    package_parts = list(path.with_suffix("").parts[:-1])
    prefix_len = max(len(package_parts) - node.level + 1, 0)
    resolved_parts = package_parts[:prefix_len]
    if module:
        resolved_parts.extend(module.split("."))
    return ".".join(part for part in resolved_parts if part)


def _banned_reason(module: str) -> str | None:
    if _is_allowed_mock_module(module):
        return None

    parts = [part.lower() for part in module.split(".")]
    if any(token in part for part in parts for token in BANNED_TOKENS):
        return "banned mock/fixture import in app code"
    return None


def _is_allowed_mock_module(module: str) -> bool:
    return any(
        module == allowed or module.startswith(f"{allowed}.")
        for allowed in ALLOWED_MOCK_MODULES
    )


def _is_under(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
    except ValueError:
        return False
    return True


if __name__ == "__main__":
    raise SystemExit(main())
