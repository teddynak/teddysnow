The SARIF 2.1.0 schema is vendored from the OASIS SARIF Technical Committee:
https://github.com/oasis-tcs/sarif-spec/blob/main/sarif-2.1/schema/sarif-schema-2.1.0.json

Canonical schema:
https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json

Keeping the schema locally makes report validation independent of the schema
host's availability. Install `scripts/requirements-ci.txt` and run
`python3 scripts/validate-sarif.py report.sarif` to validate exports.
