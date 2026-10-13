"""Run the premium auditor with JSX-aware tag normalization (no rule exclusions).

The upstream HTML tokenizer case-folds <Select> into <select>, splits <Form.Item>
at the dot and ends <Form<Values> ...> at the generic argument. Normalize only
JSX tag names/generics, keeping length/newlines and all actual HTML attributes.
Ant Form is still audited as form; motion.form is audited as form too.
"""
from pathlib import Path
import importlib.util
import re
import sys


def normalize_jsx(text: str) -> str:
    pattern = re.compile(r"(<\s*/?\s*)([A-Za-z][\w.$:-]*)(<[^<>\n]+>)?")

    def tag(match: re.Match) -> str:
        prefix, name, generic = match.groups()
        if name == "Form" or name == "motion.form":
            replacement = "form" + " " * (len(name) - 4)
        elif name[0].isupper() or "." in name:
            replacement = "X" + "-" * (len(name) - 1)
        else:
            replacement = name
        return prefix + replacement + (" " * len(generic) if generic else "")

    return pattern.sub(tag, text)


def load_auditor(path: Path | None = None):
    if path is None:
        candidates = sorted((Path.home() / ".codex/plugins/cache").glob(
            "*/frontend-design-premium/*/skills/frontend-design-premium/scripts/audit_project.py"))
        if not candidates:
            raise SystemExit("Pass --auditor PATH to the installed premium audit_project.py")
        path = candidates[-1]
    spec = importlib.util.spec_from_file_location("premium_upstream_audit", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    original = module.iter_html_tags

    def jsx_tags(text, names=None):
        yield from original(normalize_jsx(text), names)

    module.iter_html_tags = jsx_tags
    return module


def main() -> int:
    arguments = sys.argv[1:]
    path = None
    if "--auditor" in arguments:
        index = arguments.index("--auditor")
        path = Path(arguments[index + 1])
        del arguments[index:index + 2]
    module = load_auditor(path)
    return module.main(arguments)


if __name__ == "__main__":
    raise SystemExit(main())
