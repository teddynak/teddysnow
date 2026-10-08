#!/usr/bin/env python3
"""Validate reports against the vendored OASIS SARIF 2.1.0 schema."""
import argparse
import json
from pathlib import Path
import sys

from jsonschema import Draft4Validator, FormatChecker


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reports", nargs="+", type=Path)
    args = parser.parse_args()
    schema_path = Path(__file__).parent / "schemas" / "sarif-schema-2.1.0.json"
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    validator = Draft4Validator(schema, format_checker=FormatChecker())
    failed = False
    for path in args.reports:
        try:
            report = json.loads(path.read_text(encoding="utf-8"))
            errors = sorted(validator.iter_errors(report), key=lambda error: str(list(error.path)))
            if errors:
                failed = True
                for error in errors:
                    location = "/".join(map(str, error.path)) or "root"
                    print(f"{path}: {location}: {error.message}", file=sys.stderr)
            else:
                print(f"Valid SARIF: {path}")
        except (OSError, ValueError) as error:
            failed = True
            print(f"{path}: {error}", file=sys.stderr)
    return int(failed)


if __name__ == "__main__":
    sys.exit(main())
